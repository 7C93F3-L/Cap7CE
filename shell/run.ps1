param([string]$Catalog)
$ErrorActionPreference = 'Stop'
$phaseRoot = Split-Path $PSScriptRoot -Parent
$phaseExecutable = Join-Path $PSScriptRoot 'artifacts/winui/Cap7CE.WinUI.exe'
if (-not (Test-Path -LiteralPath $phaseExecutable)) { throw 'Run shell/build.ps1 first.' }
$phaseInfo = [Diagnostics.ProcessStartInfo]::new($phaseExecutable)
$phaseInfo.UseShellExecute = $false
$phaseInfo.Environment['CAP7CE_PHASEF_ROOT'] = $phaseRoot
if ($Catalog) { $phaseInfo.Environment['CAP7CE_PHASEF_CATALOG'] = (Resolve-Path -LiteralPath $Catalog).Path }
[Diagnostics.Process]::Start($phaseInfo)
