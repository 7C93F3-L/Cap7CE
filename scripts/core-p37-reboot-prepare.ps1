param([switch]$CheckpointOnly)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = Join-Path $repoRoot 'core\artifacts\p37-lifecycle'
$bundleRoot = Join-Path $artifactRoot '1.0.1\bundle'
$setupPath = Join-Path $bundleRoot 'Cap7CE.Core.Setup.exe'
$checkpointPath = Join-Path $artifactRoot 'reboot-checkpoint.json'
$serviceName = 'Cap7CENtfsReaderP37LifecycleProbe'
$productName = 'Cap7CE-P37-Lifecycle'
$coreRoot = Join-Path $env:ProgramFiles "$productName\Core\v1"
$readerRoot = Join-Path $env:ProgramFiles "$productName\NtfsReader\v1"
$programDataRoot = Join-Path $env:ProgramData $productName
$localDataRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $productName
$coreExecutable = Join-Path $coreRoot 'Cap7CE.Core.Host.exe'
$readerExecutable = Join-Path $readerRoot 'Cap7CE.Core.Reader.Host.exe'
$utf8 = [Text.UTF8Encoding]::new($false)

function Get-ProbeService {
    return Get-Service -Name $serviceName -ErrorAction SilentlyContinue
}

function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
}

$serviceBefore = Get-ProbeService
$programFilesRoot = Split-Path -Parent $coreRoot
if ($serviceBefore) {
    if (-not (Test-Path -LiteralPath $programFilesRoot) -or
        -not (Test-Path -LiteralPath $programDataRoot)) {
        throw [InvalidOperationException]::new('p37-reboot-existing-state-incomplete')
    }
    $setupAction = 'repair'
}
else {
    foreach ($path in @($programFilesRoot, $programDataRoot, $localDataRoot)) {
        if (Test-Path -LiteralPath $path) {
            throw [InvalidOperationException]::new('p37-reboot-target-already-exists')
        }
    }
    $setupAction = 'enable'
}

if (-not $CheckpointOnly) {
    & node (Join-Path $repoRoot 'scripts\core-p37-lifecycle-payload-build.cjs')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $setupPath)) {
        throw [InvalidOperationException]::new('p37-reboot-build-failed')
    }
    $verifyOutput = & $setupPath --verify-payload 2>&1
    if ($LASTEXITCODE -ne 0 -or (@($verifyOutput)[-1] | ConvertFrom-Json).status -ne 'verified') {
        throw [InvalidOperationException]::new('p37-reboot-payload-invalid')
    }
    $installOutput = & $setupPath --activation-coordinator --action $setupAction --catalog preserve 2>&1
    $installExitCode = $LASTEXITCODE
    $install = @($installOutput)[-1] | ConvertFrom-Json
    if ($installExitCode -ne 0 -or $install.status -ne 'passed' -or
        $install.transactionStatus -ne 'succeeded' -or -not $install.systemChangesCommitted -or
        $install.cleanupRequired) {
        throw [InvalidOperationException]::new('p37-reboot-install-failed')
    }
}
elseif (-not $serviceBefore -or -not (Test-Path -LiteralPath $setupPath)) {
    throw [InvalidOperationException]::new('p37-reboot-checkpoint-precondition')
}

$service = Get-ProbeService
if (-not $service -or $service.Status -ne 'Stopped' -or $service.StartType -ne 'Manual') {
    throw [InvalidOperationException]::new('p37-reboot-service-precondition')
}
if ((Get-Content -Raw -LiteralPath (Join-Path $coreRoot 'capability-version.txt')).Trim() -ne '1.0.1') {
    throw [InvalidOperationException]::new('p37-reboot-version-marker')
}
$coreHash = Get-Sha256 $coreExecutable
$readerHash = Get-Sha256 $readerExecutable
if ($coreHash -ne (Get-Sha256 (Join-Path $bundleRoot 'payload\core\Cap7CE.Core.Host.exe')) -or
    $readerHash -ne (Get-Sha256 (Join-Path $bundleRoot 'payload\reader\Cap7CE.Core.Reader.Host.exe'))) {
    throw [InvalidOperationException]::new('p37-reboot-installed-payload-mismatch')
}

$boot = Get-CimInstance Win32_OperatingSystem
$checkpoint = [ordered]@{
    schemaVersion = 1
    phase = 'ready-for-reboot'
    capabilityVersion = '1.0.1'
    serviceName = $serviceName
    preRebootBootTicks = $boot.LastBootUpTime.ToUniversalTime().Ticks
    serviceStartMode = $service.StartType.ToString()
    serviceState = $service.Status.ToString()
    coreSha256 = $coreHash
    readerSha256 = $readerHash
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
    rebootRequestedByProbe = $false
}
[IO.File]::WriteAllText(
    $checkpointPath,
    ($checkpoint | ConvertTo-Json -Depth 4 -Compress),
    $utf8)

Write-Output ($checkpoint | ConvertTo-Json -Depth 4 -Compress)
