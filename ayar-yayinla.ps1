# update-worker\config.json'u yayınlar; uygulama bir sonraki açılışta yeni ayarı kullanır (build gerekmez).
#   announcement   : null ya da { "id": "2026-10-22", "text": "Metro bugün 22:00'de kapanıyor", "level": "warning" }
#                    (id değişince kapatılmış duyuru yeniden görünür)
#   features.liveArrivals : false yapılırsa İZTEK canlı verisi kapanır, her yer tarifeye düşer
#   minVersionCode : bunun altındaki APK'lar güncellemeye zorlanır (yayinla.ps1 çıktısındaki sayı)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$file = 'update-worker\config.json'
$raw = Get-Content $file -Raw
$null = $raw | ConvertFrom-Json  # bozuk JSON yüklenmesin
$token = (Get-Content .ota-token -Raw).Trim()
Invoke-WebRequest 'https://yolbul-updates.ibrahimkayracetin2008.workers.dev/config.json' -Method Put `
    -Body ([Text.Encoding]::UTF8.GetBytes($raw)) -ContentType 'application/json' `
    -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing | Out-Null
Write-Host 'Ayar yayınlandı.' -ForegroundColor Green
