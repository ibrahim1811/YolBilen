# Release APK'yı derler ve Cloudflare'a (R2 + Worker) yükler; telefondaki uygulama açılışta güncellemeyi kendisi bulur.
# Kullanım (repo kökünde):  .\yayinla.ps1 -Notlar "Yeni rota motoru, tarife ekranı yenilendi"
param(
    [string]$Notlar = ''
)
# Gradle/wrangler stderr'e uyarı yazar; PowerShell 5.1 bunu hata sayar. Başarı her adımda $LASTEXITCODE ile kontrol edilir.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$Wrangler = 'wrangler@4.151.3'
$Bucket = 'yolbul-updates'

if (git status --porcelain) {
    Write-Warning 'Commit edilmemiş değişiklik var; görünen sürüm numarası commit sayısından gelir.'
}

Push-Location android
& .\gradlew.bat assembleRelease -q
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'APK derlenemedi.' }
Pop-Location

$out = 'android\app\build\outputs\apk\release'
$meta = (Get-Content "$out\output-metadata.json" -Raw | ConvertFrom-Json).elements[0]
$apkPath = Join-Path $out $meta.outputFile
$apkName = "yolbul-$($meta.versionCode).apk"
$md5 = (Get-FileHash $apkPath -Algorithm MD5).Hash.ToLower()

$stage = Join-Path $env:TEMP 'yolbul-yayin'
New-Item -ItemType Directory -Force $stage | Out-Null
$versionFile = Join-Path $stage 'version.json'
$json = [ordered]@{
    versionCode = $meta.versionCode
    versionName = $meta.versionName
    apk         = $apkName
    md5         = $md5
    notes       = $Notlar
} | ConvertTo-Json
# PowerShell 5.1'in utf8'i BOM ekler; JSON.parse'ı bozmasın diye BOM'suz yazılır
[IO.File]::WriteAllText($versionFile, $json, (New-Object Text.UTF8Encoding $false))

Push-Location update-worker
try {
    # Kova yoksa oluştur (varsa hata verir, yok sayılır)
    npx --yes $Wrangler r2 bucket create $Bucket 2>$null | Out-Null

    $apkType = 'application/vnd.android.package-archive'
    npx --yes $Wrangler r2 object put "$Bucket/$apkName" --file "$(Resolve-Path "..\$apkPath")" --content-type $apkType --remote
    if ($LASTEXITCODE -ne 0) { throw 'APK yüklenemedi.' }
    npx --yes $Wrangler r2 object put "$Bucket/yolbul.apk" --file "$(Resolve-Path "..\$apkPath")" --content-type $apkType --remote
    if ($LASTEXITCODE -ne 0) { throw 'yolbul.apk yüklenemedi.' }
    # version.json en son yüklenir: telefonlar ancak APK hazır olduktan sonra yeni sürümü görür
    npx --yes $Wrangler r2 object put "$Bucket/version.json" --file $versionFile --content-type 'application/json' --remote
    if ($LASTEXITCODE -ne 0) { throw 'version.json yüklenemedi.' }

    npx --yes $Wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw 'Worker yayınlanamadı.' }
}
finally {
    Pop-Location
}

Write-Host "Yayınlandı: sürüm $($meta.versionName) ($($meta.versionCode))" -ForegroundColor Green
Write-Host 'İndirme bağlantısı: https://yolbul-updates.ibrahimkayracetin2008.workers.dev/yolbul.apk'
