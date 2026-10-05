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
if (Test-Path -LiteralPath $pointBinary) {
    & $pointBinary
} else {
    $pointGo = Get-Command go -ErrorAction SilentlyContinue
    if (-not $pointGo) { $pointGo = 'C:\Users\zpvis\sdk\go1.26.5\bin\go.exe' }
    & $pointGo run ./cmd/point
}
exit $LASTEXITCODE
