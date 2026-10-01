$ErrorActionPreference = 'Stop'
try {
    $health = Invoke-RestMethod 'http://127.0.0.1:18765/api/health' -TimeoutSec 2
    if ($health.app -ne 'DouK-Desktop') { throw 'Port 18765 is occupied by another program.' }
    Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18765/api/shutdown' -TimeoutSec 5 | Out-Null
    Write-Host 'DouK Desktop is shutting down and cancelling unfinished downloads.'
} catch { Write-Host $_.Exception.Message }
