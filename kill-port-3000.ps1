# PowerShell script to kill processes using port 3000 on Windows
Write-Host "Checking for processes using port 3000..." -ForegroundColor Yellow

# Find processes using port 3000
$processes = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    Write-Host "Found processes using port 3000: $($processes -join ', ')" -ForegroundColor Red
    
    foreach ($pid in $processes) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Killing process: $($proc.ProcessName) (PID: $pid)" -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host "Port 3000 should now be free!" -ForegroundColor Green
} else {
    Write-Host "No processes found using port 3000." -ForegroundColor Green
}

# Wait a moment and verify
Start-Sleep -Seconds 1
$remaining = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($remaining) {
    Write-Host "Warning: Some processes may still be using port 3000" -ForegroundColor Red
} else {
    Write-Host "Port 3000 is now free!" -ForegroundColor Green
}

