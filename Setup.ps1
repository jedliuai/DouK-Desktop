param([string]$EngineVersion = '')
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
Push-Location -LiteralPath $projectDir
try {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.12 or newer is required.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js 20.19+ or 22.12+ is required.' }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required to install the upstream engine.' }
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
    }
    & '.\.venv\Scripts\python.exe' -m pip install --disable-pip-version-check -r backend\requirements.lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    Push-Location -LiteralPath 'frontend'
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
    $engineArgs = @('-m', 'backend.setup_engine')
    if ($EngineVersion) { $engineArgs += @('--version', $EngineVersion) }
    & '.\.venv\Scripts\python.exe' @engineArgs
    if ($LASTEXITCODE -ne 0) { throw 'Engine installation failed. See .runtime/engine-install.log.' }
    Write-Host 'Setup complete. Double-click Start-DouK.cmd to open DouK Desktop.'
} finally { Pop-Location }
