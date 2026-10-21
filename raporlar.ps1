# Uygulamadan gelen son hata raporlarını listeler.
# Kullanım:  .\raporlar.ps1            (son 20)
#            .\raporlar.ps1 -Adet 5 -Detay   (kayıtlar ve hata yığınıyla)
param(
    [int]$Adet = 20,
    [switch]$Detay
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$token = (Get-Content .ota-token -Raw).Trim()
$reports = Invoke-RestMethod "https://yolbul-updates.ibrahimkayracetin2008.workers.dev/reports?limit=$Adet" `
    -Headers @{ Authorization = "Bearer $token" }
foreach ($r in $reports) {
    $when = ([datetime]$r.created_at).ToLocalTime().ToString('dd.MM HH:mm')
    Write-Host "#$($r.id) $when [$($r.kind)] $($r.app_version) · $($r.device)" -ForegroundColor Cyan
    if ($r.user_note) { Write-Host "  Not: $($r.user_note)" -ForegroundColor Yellow }
    Write-Host "  $($r.message)"
    if ($Detay) {
        if ($r.stack) { Write-Host "  --- yığın ---`n$($r.stack)" -ForegroundColor DarkGray }
        if ($r.logs) { Write-Host "  --- son kayıtlar ---`n$($r.logs)" -ForegroundColor DarkGray }
    }
}
