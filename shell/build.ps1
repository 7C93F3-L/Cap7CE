param([switch]$SkipCoreResources)
$ErrorActionPreference = 'Stop'
$phaseRoot = Split-Path $PSScriptRoot -Parent
Push-Location $phaseRoot
try {
    if (-not $SkipCoreResources) {
        if (-not (Test-Path 'native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe')) { & node scripts/core-visuals-build.cjs; if ($LASTEXITCODE) { throw 'Core visual build failed' } }
        if (-not (Test-Path 'native/artifacts/metadata-media/v1/Cap7CE.Media.Metadata.exe')) { & node scripts/metadata-media-build.cjs; if ($LASTEXITCODE) { throw 'Metadata adapter build failed' } }
        $phaseMissingWorkers = @('node.exe','visual-cache.cjs','provider-preview.cjs','office-preview.cjs','model-runtime.cjs','extractors.json') | Where-Object { -not (Test-Path (Join-Path 'artifacts/metadata-worker/v1' $_)) }
        if ($phaseMissingWorkers) { & node scripts/metadata-worker-build.cjs; if ($LASTEXITCODE) { throw 'Core Node build failed' } }
        if (-not (Test-Path 'core/artifacts/configuration-host/Cap7CE.Core.Configuration.Host.exe')) { & node scripts/core-configuration-build.cjs; if ($LASTEXITCODE) { throw 'Configuration host build failed' } }
        & node -e "process.exit(require('./scripts/core-file-operations-freshness.cjs').isFresh(process.cwd()) ? 0 : 1)"
        if ($LASTEXITCODE -ne 0) { & node scripts/core-file-operations-build.cjs; if ($LASTEXITCODE) { throw 'File operations host build failed' } }
    }
    & node scripts/winui-resources.cjs
    if ($LASTEXITCODE) { throw 'WinUI resource generation failed' }
    & dotnet publish shell/Cap7CE.QueryHost/Cap7CE.QueryHost.csproj -c Release --self-contained false -o shell/artifacts/query
    if ($LASTEXITCODE) { throw 'Query host build failed' }
    & dotnet build shell/Cap7CE.WinUI/Cap7CE.WinUI.csproj -c Release -p:Platform=x64 -o shell/artifacts/winui
    if ($LASTEXITCODE) { throw 'WinUI build failed' }
} finally { Pop-Location }
