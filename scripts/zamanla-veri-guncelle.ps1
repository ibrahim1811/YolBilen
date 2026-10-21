# veri-guncelle.ps1'i her Pazartesi 04:00'te çalışacak şekilde Windows Görev Zamanlayıcı'ya kaydeder.
# Bilgisayar o saatte kapalıysa/uykudaysa ilk açılışta çalışır. Yönetici yetkisi gerekmez (mevcut kullanıcı).
# Kullanım:  .\scripts\zamanla-veri-guncelle.ps1          # kaydet/güncelle
#            .\scripts\zamanla-veri-guncelle.ps1 -Kaldir  # görevi sil
param([switch]$Kaldir)

$TaskName = 'Yolbul Veri Güncelle'
$Script = Join-Path $PSScriptRoot 'veri-guncelle.ps1'
$Root = Split-Path $PSScriptRoot -Parent

if ($Kaldir) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Görev kaldırıldı: $TaskName" -ForegroundColor Green
    return
}

if (-not (Test-Path $Script)) { throw "Bulunamadı: $Script" }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Script`"" `
    -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '04:00'
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'İzmir GTFS (ESHOT, metro, tramvay, İZBAN) değiştiyse Yolbul verisini yeniden üretir ve OTA ile yayınlar. Log: scripts\logs' `
    -Force | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host "Kaydedildi: $TaskName  (her Pazartesi 04:00, kaçırılırsa ilk fırsatta)" -ForegroundColor Green
Write-Host "Sonraki çalışma: $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
Write-Host "Elle çalıştırmak için: Start-ScheduledTask -TaskName '$TaskName'"
