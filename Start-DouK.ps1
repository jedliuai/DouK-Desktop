$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$pythonPath = Join-Path $projectDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath (Join-Path $projectDir 'frontend\dist\index.html'))) {
    & (Join-Path $projectDir 'Setup.ps1')
}
$healthUrl = 'http://127.0.0.1:18765/api/health'
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.app -ne 'DouK-Desktop') { throw 'Port 18765 is occupied by another program.' }
    Start-Process 'http://127.0.0.1:18765'
    exit 0
} catch {
    if ($_.Exception.Message -like '*occupied*') { throw }
}
$runtimeDir = Join-Path $projectDir '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$process = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'backend.run') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'desktop.log') -RedirectStandardError (Join-Path $runtimeDir 'desktop-error.log')
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { throw 'DouK Desktop failed to start. See .runtime/desktop-error.log.' }
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.app -eq 'DouK-Desktop') {
            Start-Process 'http://127.0.0.1:18765'
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
throw 'Startup timed out. See .runtime/desktop-error.log.'
