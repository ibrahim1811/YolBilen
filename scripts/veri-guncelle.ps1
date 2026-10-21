# Haftalık tarife/GTFS güncellemesi: kaynak zip'leri indirir, değiştiyse uygulama verisini yeniden üretir ve OTA ile yayınlar.
# Kullanım (repo kökünde):
#   .\scripts\veri-guncelle.ps1            # değişiklik varsa üret + doğrula + yayınla
#   .\scripts\veri-guncelle.ps1 -KontrolEt # sadece indir ve değişiklik var mı bak
#   .\scripts\veri-guncelle.ps1 -Zorla     # değişiklik olmasa da yeniden üret (ör. İZBAN API saatleri değiştiyse)
#   .\scripts\veri-guncelle.ps1 -YayinlamaYok  # üret + doğrula ama OTA yayını yapma
#   .\scripts\veri-guncelle.ps1 -DurumuKaydet  # ilk kurulum: mevcut kaynakların hash'ini kaydet, build yapma
param(
    [switch]$KontrolEt,
    [switch]$Zorla,
    [switch]$YayinlamaYok,
    [switch]$DurumuKaydet
)
# Node/npx stderr'e uyarı yazar; PowerShell 5.1 bunu hata sayar. Başarı her adımda $LASTEXITCODE ile kontrol edilir.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$Sources = [ordered]@{
    bus   = 'https://www.eshot.gov.tr/gtfs/bus-eshot-gtfs.zip'
    metro = 'https://www.izmirmetro.com.tr/gtfs/rail-metro-gtfs.zip'
    tram  = 'https://www.tramizmir.com/gtfs/rail-tramizmir-gtfs.zip'
    izban = 'https://www.izban.com.tr/gtfs/rail-izban-gtfs.zip'
}
$BusRequired = 'routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'calendar.txt', 'shapes.txt'
$StateFile = Join-Path $PSScriptRoot '.veri-durum.json'
$LogDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("veri-guncelle-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))

function Log([string]$msg, [string]$color = 'Gray') {
    $line = '{0}  {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Host $line -ForegroundColor $color
}

function Fail([string]$msg) {
    Log "HATA: $msg" 'Red'
    exit 1
}

# Node script'ini çalıştırır; çıktıyı loglar. $DoneMarker verilirse çıktıda aranır
# (bazı eski script'ler hatada da 0 ile çıkıyor, başarıyı bu satırdan anlıyoruz).
function Run-Node([string]$label, [string[]]$nodeArgs, [string]$DoneMarker = '') {
    Log "→ $label"
    $out = & node @nodeArgs 2>&1 | ForEach-Object { "$_" }
    $out | ForEach-Object { Add-Content -Path $LogFile -Value "    $_" -Encoding utf8 }
    # throw: çağıran try/catch önceki veriyi geri yükler
    if ($LASTEXITCODE -ne 0) { throw "$label başarısız (çıkış kodu $LASTEXITCODE)" }
    if ($DoneMarker -and -not ($out -match [regex]::Escape($DoneMarker))) { throw "$label tamamlanmadı ('$DoneMarker' satırı yok, log'a bak)" }
}

function Test-ZipHeader([string]$path) {
    $fs = [IO.File]::OpenRead($path)
    try { $b = New-Object byte[] 2; $n = $fs.Read($b, 0, 2) } finally { $fs.Dispose() }
    return $n -eq 2 -and $b[0] -eq 0x50 -and $b[1] -eq 0x4B
}

# ── 1. İndir (güvenilmeyen veri: kendi boş geçici klasörüne) ─────────────────
$Work = Join-Path $env:TEMP ("yolbul-veri-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $Work | Out-Null
Log "Geçici klasör: $Work"

$state = @{}
if (Test-Path $StateFile) {
    (Get-Content $StateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value }
}

$hashes = [ordered]@{}
$changed = @()
foreach ($name in $Sources.Keys) {
    $zip = Join-Path $Work "$name.zip"
    try {
        Invoke-WebRequest -Uri $Sources[$name] -OutFile $zip -UseBasicParsing -TimeoutSec 300
    } catch {
        Fail "$name indirilemedi ($($Sources[$name])): $($_.Exception.Message)"
    }
    # Sunucu hata sayfası (HTML) dönerse zip başlığı "PK" olmaz
    if (-not (Test-ZipHeader $zip)) { Fail "$name geçerli bir zip değil ($($Sources[$name]))" }
    $h = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    $hashes[$name] = $h
    $size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
    if ($state[$name] -ne $h) {
        $changed += $name
        Log ("{0,-6} DEĞİŞMİŞ  {1} MB  {2}" -f $name, $size, $h.Substring(0, 12)) 'Yellow'
    } else {
        Log ("{0,-6} aynı      {1} MB" -f $name, $size)
    }
}

if ($DurumuKaydet) {
    # Mevcut uygulama verisi bu kaynaklardan üretildiyse: build yapmadan başlangıç noktası olarak kaydet
    $hashes['guncellendi'] = (Get-Date).ToString('s')
    [IO.File]::WriteAllText($StateFile, ($hashes | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    Log "Durum kaydedildi: $StateFile" 'Green'
    Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

if ($KontrolEt) {
    if ($changed.Count -eq 0) { Log 'Veri güncel (kontrol modu).' 'Green' }
    else { Log "Değişen kaynaklar: $($changed -join ', ') (kontrol modu, hiçbir şey üretilmedi)." 'Yellow' }
    Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

if ($changed.Count -eq 0 -and -not $Zorla) {
    Log 'Veri güncel, yapılacak bir şey yok.' 'Green'
    Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}
$busChanged = $Zorla -or ($changed -contains 'bus')
$railChanged = $Zorla -or ($changed | Where-Object { $_ -ne 'bus' })

# ── 2. Aç ve doğrula ─────────────────────────────────────────────────────────
foreach ($name in $Sources.Keys) {
    $dest = Join-Path $Work "x\$name"
    try { Expand-Archive -Path (Join-Path $Work "$name.zip") -DestinationPath $dest -Force }
    catch { Fail "$name açılamadı: $($_.Exception.Message)" }
}
$busDir = Join-Path $Work 'x\bus'
foreach ($f in $BusRequired) {
    if (-not (Test-Path (Join-Path $busDir $f))) { Fail "ESHOT GTFS'te $f yok; kaynak biçimi değişmiş olabilir." }
}

# Hata olursa geri almak için mevcut üretilmiş veriyi yedekle
$Backup = Join-Path $Work 'yedek'
New-Item -ItemType Directory -Force $Backup | Out-Null
Copy-Item 'src\data\gtfs' (Join-Path $Backup 'gtfs') -Recurse
Copy-Item 'src\data\schedules.json' $Backup
$busAssets = 'assets\gtfs\bus-eshot-gtfs'
if ($busChanged) { Copy-Item $busAssets (Join-Path $Backup 'bus-eshot-gtfs') -Recurse }

function Restore {
    Log 'Önceki veri geri yükleniyor…' 'Yellow'
    Remove-Item 'src\data\gtfs' -Recurse -Force
    Copy-Item (Join-Path $Backup 'gtfs') 'src\data\gtfs' -Recurse
    Copy-Item (Join-Path $Backup 'schedules.json') 'src\data\schedules.json' -Force
    if (Test-Path (Join-Path $Backup 'bus-eshot-gtfs')) {
        Remove-Item $busAssets -Recurse -Force
        Copy-Item (Join-Path $Backup 'bus-eshot-gtfs') $busAssets -Recurse
    }
}

$dataBefore = @{}
Get-ChildItem 'src\data' -Recurse -File | ForEach-Object { $dataBefore[$_.FullName] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash }

try {
    # ── 3. Otobüs verisi ─────────────────────────────────────────────────────
    if ($busChanged) {
        Log 'ESHOT GTFS assets klasörüne kopyalanıyor'
        Remove-Item $busAssets -Recurse -Force
        Copy-Item $busDir $busAssets -Recurse
        Copy-Item (Join-Path $Work 'bus.zip') 'assets\gtfs\bus-eshot-gtfs.zip' -Force

        # Sıra önemli: build-bus-offsets, build-gtfs'in ürettiği route-stop-seqs.json'ı okur
        Run-Node 'Duraklar, hat sıraları, şekiller (build-gtfs)' @('scripts/build-gtfs.mjs') 'Done.'
        Run-Node 'Sefer saatleri (buildSchedule)' @('scripts/buildSchedule.js') 'Done!'
        Run-Node 'Durak bazlı süreler (build-bus-offsets)' @('--max-old-space-size=4096', 'scripts/build-bus-offsets.mjs') 'patterns:'
    }

    # ── 4. Raylı sistem ve vapur ─────────────────────────────────────────────
    if ($railChanged) {
        # İZBAN/İzdeniz saatleri openapi.izmir.bel.tr'den gelir; istek limiti yüzünden birkaç dakika sürebilir
        Run-Node 'Metro, tramvay, İZBAN, vapur (build-rail-gtfs)' @('scripts/build-rail-gtfs.mjs', (Join-Path $Work 'x')) 'Bitti:'
    }

    # ── 5. Doğrula ───────────────────────────────────────────────────────────
    Log '→ Tip kontrolü (tsc --noEmit)'
    $tsc = & npx tsc --noEmit 2>&1 | ForEach-Object { "$_" }
    $tsc | ForEach-Object { Add-Content -Path $LogFile -Value "    $_" -Encoding utf8 }
    if ($LASTEXITCODE -ne 0) { throw "Tip kontrolü başarısız:`n$($tsc | Select-Object -First 10 | Out-String)" }
} catch {
    Log "HATA: $($_.Exception.Message)" 'Red'
    Restore
    exit 1
}

$changedFiles = Get-ChildItem 'src\data' -Recurse -File | Where-Object {
    $dataBefore[$_.FullName] -ne (Get-FileHash $_.FullName -Algorithm SHA256).Hash
} | ForEach-Object { $_.FullName.Substring($Root.Length + 1) }
if ($changedFiles) {
    Log "Değişen veri dosyaları:`n  $($changedFiles -join "`n  ")" 'Cyan'
} else {
    Log 'Üretilen veri öncekiyle birebir aynı (kaynak zip değişmiş ama içerik etkilenmemiş).' 'Cyan'
}

# ── 6. Firestore tarifeleri (opsiyonel; kimlik bilgisi yoksa atlanır) ────────
$sa = if ($env:SERVICE_ACCOUNT) { $env:SERVICE_ACCOUNT } else { Join-Path $Root 'serviceAccount.json' }
if ($busChanged -and (Test-Path $sa)) {
    $env:SERVICE_ACCOUNT = $sa
    Log '→ Firestore tarifeleri (syncSchedulesToFirestore)'
    & node scripts/syncSchedulesToFirestore.js 2>&1 | ForEach-Object { Add-Content -Path $LogFile -Value "    $_" -Encoding utf8 }
    if ($LASTEXITCODE -ne 0) { Log 'UYARI: Firestore senkronu başarısız; uygulama içi tarife yine de güncel.' 'Yellow' }
} elseif ($busChanged) {
    Log 'UYARI: serviceAccount.json yok, Firestore senkronu atlandı (uygulama içi tarife yeterli).' 'Yellow'
}

# ── 7. OTA yayını ────────────────────────────────────────────────────────────
if ($changedFiles -and -not $YayinlamaYok) {
    $ota = Join-Path $Root 'ota-yayinla.ps1'
    if (Test-Path $ota) {
        Log '→ OTA yayını (ota-yayinla.ps1)'
        & $ota -Notlar ("Tarife güncellendi ({0})" -f (Get-Date -Format 'dd.MM.yyyy'))
        if ($LASTEXITCODE -ne 0) { Fail 'OTA yayını başarısız; veri üretildi ama telefonlara gitmedi. Elle ota-yayinla.ps1 çalıştır.' }
    } else {
        Log 'UYARI: ota-yayinla.ps1 bulunamadı, yayın atlandı. Veri yerelde güncel.' 'Yellow'
    }
}

# ── 8. Durumu kaydet (yalnızca her şey başarılıysa) ──────────────────────────
$hashes['guncellendi'] = (Get-Date).ToString('s')
[IO.File]::WriteAllText($StateFile, ($hashes | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
Log 'Tamamlandı.' 'Green'
exit 0
