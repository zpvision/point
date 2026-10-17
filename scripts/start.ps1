param([switch]$Build)
$ErrorActionPreference = 'Stop'
$pointRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $pointRoot
$pointEnvPath = Join-Path $pointRoot '.env'
if (-not (Test-Path -LiteralPath $pointEnvPath)) {
    throw 'Missing .env. Copy .env.example to .env and set the configuration.'
}

foreach ($pointLine in Get-Content -LiteralPath $pointEnvPath -Encoding UTF8) {
    if ($pointLine -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
    $pointName = $Matches[1]
    $pointValue = $Matches[2].Trim()
    if ($pointValue.Length -ge 2 -and (($pointValue.StartsWith('"') -and $pointValue.EndsWith('"')) -or ($pointValue.StartsWith("'") -and $pointValue.EndsWith("'")))) {
        $pointValue = $pointValue.Substring(1, $pointValue.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($pointName, $pointValue, 'Process')
}

$pointBinary = Join-Path $pointRoot 'var/point.exe'
if ($Build -or -not (Test-Path -LiteralPath (Join-Path $pointRoot 'web/dist/index.html'))) {
    if (-not (Test-Path -LiteralPath (Join-Path $pointRoot 'node_modules'))) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
}
if ($Build -or -not (Test-Path -LiteralPath $pointBinary)) {
    $pointGo = Get-Command go -ErrorAction SilentlyContinue
    if (-not $pointGo) { throw 'Go 1.26.5+ is required in PATH' }
    New-Item -ItemType Directory -Path (Join-Path $pointRoot 'var') -Force | Out-Null
    & $pointGo.Source build -o $pointBinary ./cmd/point
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
}
& $pointBinary
exit $LASTEXITCODE
