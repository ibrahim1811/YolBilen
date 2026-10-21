# Sadece JavaScript değişikliklerini (ekranlar, rota motoru, tarife verisi) telefonlara anında gönderir; APK gerekmez.
# Telefon bir sonraki açılışta arka planda indirir, "Yeni sürüm hazır · Yenile" der.
# Kullanım (repo kökünde):  .\ota-yayinla.ps1 -Notlar "Rota ekranı düzeltildi"
#
# ÖNEMLİ: Yeni bir native modül eklendiyse (npx expo install ...) JS güncellemesi eski APK'da çöker.
# O durumda app.json "runtimeVersion" ve AndroidManifest EXPO_RUNTIME_VERSION birlikte artırılır ve önce .\yayinla.ps1 çalıştırılır.
param(
    [string]$Notlar = ''
)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$Base = 'https://yolbul-updates.ibrahimkayracetin2008.workers.dev'
$tokenFile = Join-Path $PSScriptRoot '.ota-token'
if (-not (Test-Path $tokenFile)) { throw '.ota-token bulunamadı (Cloudflare yükleme anahtarı).' }
$auth = @{ Authorization = "Bearer $((Get-Content $tokenFile -Raw).Trim())" }

$runtime = (Get-Content app.json -Raw | ConvertFrom-Json).expo.runtimeVersion
$manifestXml = Get-Content android\app\src\main\AndroidManifest.xml -Raw
if ($manifestXml -notmatch "EXPO_RUNTIME_VERSION`" android:value=`"$([regex]::Escape($runtime))`"") {
    throw "app.json runtimeVersion ($runtime) AndroidManifest'teki EXPO_RUNTIME_VERSION ile aynı değil."
}

$out = 'dist-ota'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$env:NODE_ENV = 'production'
npx expo export --platform android --output-dir $out
if ($LASTEXITCODE -ne 0) { throw 'JS paketi oluşturulamadı.' }

$meta = (Get-Content "$out\metadata.json" -Raw | ConvertFrom-Json).fileMetadata.android

$contentTypes = @{
    ttf = 'font/ttf'; otf = 'font/otf'; png = 'image/png'; jpg = 'image/jpeg'; jpeg = 'image/jpeg'
    gif = 'image/gif'; webp = 'image/webp'; svg = 'image/svg+xml'; json = 'application/json'
}

function Get-Base64UrlSha256([string]$path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($path)
    try { $hash = $sha.ComputeHash($stream) } finally { $stream.Dispose() }
    [Convert]::ToBase64String($hash).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Publish-Asset([string]$relPath, [string]$contentType) {
    $full = (Resolve-Path (Join-Path $out $relPath)).Path
    $key = (Get-FileHash $full -Algorithm MD5).Hash.ToLower()
    $url = "$Base/ota/assets/$key"
    $exists = $true
    try { Invoke-WebRequest $url -Method Head -UseBasicParsing | Out-Null } catch { $exists = $false }
    if (-not $exists) {
        Invoke-WebRequest $url -Method Put -InFile $full -ContentType $contentType -Headers $auth -UseBasicParsing | Out-Null
        Write-Host "  yüklendi: $relPath"
    }
    [ordered]@{ hash = (Get-Base64UrlSha256 $full); key = $key; contentType = $contentType; url = $url }
}

Write-Host 'Dosyalar yükleniyor (değişmeyenler atlanır)...'
try {
    $launch = Publish-Asset $meta.bundle 'application/javascript'
    $launch.fileExtension = '.bundle'
    $assets = @(foreach ($a in $meta.assets) {
        $type = $contentTypes[$a.ext]
        if (-not $type) { $type = 'application/octet-stream' }
        $entry = Publish-Asset $a.path $type
        $entry.fileExtension = ".$($a.ext)"
        $entry
    })
} catch {
    throw "Yükleme başarısız: $($_.Exception.Message)"
}

$updateId = [guid]::NewGuid().ToString()
$manifest = [ordered]@{
    id             = $updateId
    createdAt      = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    runtimeVersion = $runtime
    launchAsset    = $launch
    assets         = $assets
    metadata       = @{}
    extra          = @{ notes = $Notlar }
} | ConvertTo-Json -Depth 6 -Compress

$body = [Text.Encoding]::UTF8.GetBytes($manifest)
try {
    Invoke-WebRequest "$Base/ota/manifest/$runtime" -Method Put -Body $body -ContentType 'application/json' -Headers $auth -UseBasicParsing | Out-Null
} catch {
    throw "Manifest yüklenemedi: $($_.Exception.Message)"
}

Write-Host "JS güncellemesi yayınlandı: $updateId (runtime $runtime)" -ForegroundColor Green
