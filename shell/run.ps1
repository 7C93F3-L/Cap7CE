param([string]$Catalog)
$ErrorActionPreference = 'Stop'
$phaseRoot = Split-Path $PSScriptRoot -Parent
$phaseExecutable = Join-Path $PSScriptRoot 'artifacts/winui/Cap7CE.WinUI.exe'
$phaseInputs = @(
    (Join-Path $PSScriptRoot 'build.ps1'),
    (Join-Path $PSScriptRoot 'Cap7CE.WinUI'),
    (Join-Path $PSScriptRoot 'Cap7CE.QueryHost')
)
$phaseNeedsBuild = -not (Test-Path -LiteralPath $phaseExecutable)
if (-not $phaseNeedsBuild) {
    $phaseArtifactTime = (Get-Item -LiteralPath $phaseExecutable).LastWriteTimeUtc
    foreach ($phaseInput in $phaseInputs) {
        $phaseFiles = if ((Get-Item -LiteralPath $phaseInput).PSIsContainer) {
            Get-ChildItem -LiteralPath $phaseInput -Recurse -File
        } else {
            Get-Item -LiteralPath $phaseInput
        }
        if ($phaseFiles | Where-Object { $_.LastWriteTimeUtc -gt $phaseArtifactTime } | Select-Object -First 1) {
            $phaseNeedsBuild = $true
            break
        }
    }
}
if ($phaseNeedsBuild) {
    & (Join-Path $PSScriptRoot 'build.ps1')
    if ($LASTEXITCODE) { throw 'WinUI build failed.' }
}
$phaseInfo = [Diagnostics.ProcessStartInfo]::new($phaseExecutable)
$phaseInfo.UseShellExecute = $false
$phaseInfo.Environment['CAP7CE_PHASEF_ROOT'] = $phaseRoot
if ($Catalog) { $phaseInfo.Environment['CAP7CE_PHASEF_CATALOG'] = (Resolve-Path -LiteralPath $Catalog).Path }
[Diagnostics.Process]::Start($phaseInfo)
