$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = Join-Path $repoRoot 'core\artifacts\p37-lifecycle'
$bundleRoot = Join-Path $artifactRoot '1.0.1\bundle'
$setupPath = Join-Path $bundleRoot 'Cap7CE.Core.Setup.exe'
$checkpointPath = Join-Path $artifactRoot 'reboot-checkpoint.json'
$serviceName = 'Cap7CENtfsReaderP37LifecycleProbe'
$productName = 'Cap7CE-P37-Lifecycle'
$programFilesRoot = Join-Path $env:ProgramFiles $productName
$programDataRoot = Join-Path $env:ProgramData $productName
$localDataRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $productName
$coreExecutable = Join-Path $programFilesRoot 'Core\v1\Cap7CE.Core.Host.exe'
$readerExecutable = Join-Path $programFilesRoot 'NtfsReader\v1\Cap7CE.Core.Reader.Host.exe'

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

function Wait-ServiceStopped([int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $service = Get-ProbeService
        if ($service -and $service.Status -eq 'Stopped') { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new('p37-reboot-service-stop-timeout')
}

if (-not (Test-Path -LiteralPath $checkpointPath) -or -not (Test-Path -LiteralPath $setupPath)) {
    throw [InvalidOperationException]::new('p37-reboot-checkpoint-missing')
}
$checkpoint = Get-Content -Raw -LiteralPath $checkpointPath | ConvertFrom-Json
if ($checkpoint.schemaVersion -ne 1 -or $checkpoint.phase -ne 'ready-for-reboot' -or
    $checkpoint.capabilityVersion -ne '1.0.1' -or $checkpoint.serviceName -ne $serviceName) {
    throw [InvalidOperationException]::new('p37-reboot-checkpoint-invalid')
}
$boot = Get-CimInstance Win32_OperatingSystem
if ($boot.LastBootUpTime.ToUniversalTime().Ticks -le [long]$checkpoint.preRebootBootTicks) {
    throw [InvalidOperationException]::new('p37-reboot-not-observed')
}
$service = Get-ProbeService
if (-not $service -or $service.Status -ne 'Stopped' -or $service.StartType -ne 'Manual') {
    throw [InvalidOperationException]::new('p37-reboot-service-postcondition')
}
if ((Get-Sha256 $coreExecutable) -ne $checkpoint.coreSha256 -or
    (Get-Sha256 $readerExecutable) -ne $checkpoint.readerSha256) {
    throw [InvalidOperationException]::new('p37-reboot-payload-changed')
}

$clientOutput = & $coreExecutable --reader-p37-lifecycle-client 2>&1
$clientExitCode = $LASTEXITCODE
$client = @($clientOutput)[-1] | ConvertFrom-Json
if ($clientExitCode -ne 0 -or $client.status -ne 'passed' -or
    -not $client.clientStandard -or -not $client.serviceStartedByClient -or
    -not $client.prohibitedServiceRightsDenied -or -not $client.serviceAuthenticated -or
    -not $client.expectedBinaryPath -or -not $client.demandStart -or
    $client.elevationRequested -or $client.sourceFilesRead -or
    $client.sourceVolumeWritten -or $client.networkUsed) {
    throw [InvalidOperationException]::new('p37-reboot-demand-start-failed')
}
Wait-ServiceStopped 20

$removeOutput = & $setupPath --activation-coordinator --action remove --catalog remove 2>&1
$removeExitCode = $LASTEXITCODE
$remove = @($removeOutput)[-1] | ConvertFrom-Json
if ($removeExitCode -ne 0 -or $remove.status -ne 'passed' -or
    $remove.transactionStatus -ne 'succeeded' -or -not $remove.systemChangesCommitted -or
    $remove.cleanupRequired) {
    throw [InvalidOperationException]::new('p37-reboot-remove-failed')
}
if ((Get-ProbeService) -or
    @($programFilesRoot, $programDataRoot, $localDataRoot).Where({ Test-Path -LiteralPath $_ }).Count -ne 0) {
    throw [InvalidOperationException]::new('p37-reboot-zero-residue-failed')
}

Remove-Item -LiteralPath $checkpointPath -Force
Write-Output ([ordered]@{
    status = 'passed'
    rebootObserved = $true
    serviceStayedStopped = $true
    demandStartAfterReboot = $true
    ordinaryStartElevationRequested = $false
    uninstallCompleted = $true
    zeroResidue = $true
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
} | ConvertTo-Json -Compress)
