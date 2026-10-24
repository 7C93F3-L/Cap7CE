param([string]$Catalog,[switch]$NoBuild)
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
if ($phaseNeedsBuild -and -not $NoBuild) {
    & (Join-Path $PSScriptRoot 'build.ps1')
    if ($LASTEXITCODE) { throw 'WinUI build failed.' }
}
if (-not (Test-Path -LiteralPath $phaseExecutable)) { throw 'WinUI executable is missing; build it first.' }
if (-not ('Cap7CEDesktopProcess' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'DesktopProcess.cs') }
$phaseOldRoot=$env:CAP7CE_PHASEF_ROOT
$phaseOldCatalog=$env:CAP7CE_PHASEF_CATALOG
try {
    $env:CAP7CE_PHASEF_ROOT=$phaseRoot
    # Never let an inherited fixture override silently redirect a normal launch.
    $env:CAP7CE_PHASEF_CATALOG=if($Catalog){(Resolve-Path -LiteralPath $Catalog).Path}else{$null}
    $phaseId=[Cap7CEDesktopProcess]::Start($phaseExecutable,'',$phaseRoot)
    [PSCustomObject]@{Id=$phaseId;Path=$phaseExecutable;LaunchEnvironment='Interactive desktop'}
}
finally {
    $env:CAP7CE_PHASEF_ROOT=$phaseOldRoot
    $env:CAP7CE_PHASEF_CATALOG=$phaseOldCatalog
}
