param(
    [switch]$Elevated,
    [string]$ProbeRoot,
    [string]$ExpectedReaderHash
)

$ErrorActionPreference = 'Stop'
$serviceName = 'Cap7CENtfsReaderP37Probe'
$programName = 'Cap7CE-Core-Reader-P37-Probe'
$dataName = 'Cap7CE-Core-Reader-P37-Probe'
$driveLetter = 'R'
$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $repoRoot 'core\artifacts\reader-p37'
$readerPublish = Join-Path $artifactRoot 'reader'
$corePublish = Join-Path $artifactRoot 'core'
$sourceReader = Join-Path $readerPublish 'Cap7CE.Core.Reader.Host.exe'
$clientExe = Join-Path $corePublish 'Cap7CE.Core.Host.exe'
$probeBase = Join-Path $artifactRoot 'probe'
$programDir = Join-Path $env:ProgramFiles $programName
$destinationReader = Join-Path $programDir 'Cap7CE.Core.Reader.Host.exe'
$dataDir = Join-Path $env:ProgramData $dataName

function Get-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Invoke-Sc([string[]]$Arguments) {
    & sc.exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('sc-failed') }
}

function Get-ProbeService {
    Get-CimInstance -ClassName Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
}

function Wait-ServiceState([string]$State, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $service = Get-ProbeService
        if ($null -eq $service -and $State -eq 'Deleted') { return }
        if ($null -ne $service -and $service.State -eq $State) { return }
        Start-Sleep -Milliseconds 125
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new("service-state-$State")
}

function Set-ProtectedAcl([string]$Path, [string]$ServiceSid, [string]$ServiceRights) {
    & icacls.exe $Path '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' `
        '*S-1-5-32-544:(OI)(CI)F' "*${ServiceSid}:(OI)(CI)$ServiceRights" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('acl-failed') }
}

function Write-ProbeState([string]$Name, [string]$Phase) {
    $pending = Join-Path $ProbeRoot "$Name.pending.json"
    [IO.File]::WriteAllText($pending,
        (@{ phase = $Phase } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $pending -Destination (Join-Path $ProbeRoot "$Name.json") -Force
}

function Wait-ProbeState([string]$Name, [string]$Phase, [int]$Seconds) {
    $path = Join-Path $ProbeRoot "$Name.json"
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        try {
            if ((Test-Path -LiteralPath $path) -and
                (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).phase -eq $Phase) { return }
        }
        catch { }
        Start-Sleep -Milliseconds 125
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new("probe-state-$Phase")
}

if (-not $Elevated) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw [InvalidOperationException]::new('outer-probe-must-be-standard')
    }
    if (Test-Path -LiteralPath "${driveLetter}:\") {
        throw [InvalidOperationException]::new('fixed-probe-drive-in-use')
    }
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_NOLOGO = '1'
    & dotnet build (Join-Path $repoRoot 'core\Cap7CE.Core.sln') --configuration Release --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('core-build-failed') }
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Reader.Host\Cap7CE.Core.Reader.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained true --nologo `
        -p:P37RecoveryProfile=true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=None --output $readerPublish | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sourceReader)) {
        throw [InvalidOperationException]::new('reader-publish-failed')
    }
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Host\Cap7CE.Core.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained false --nologo `
        -p:P37RecoveryProfile=true --output $corePublish | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $clientExe)) {
        throw [InvalidOperationException]::new('core-publish-failed')
    }

    New-Item -ItemType Directory -Path $probeBase -Force | Out-Null
    $ProbeRoot = Join-Path $probeBase ("run-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $ProbeRoot | Out-Null
    $readerHash = Get-Sha256 $sourceReader
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
        '-Elevated', '-ProbeRoot', $ProbeRoot, '-ExpectedReaderHash', $readerHash)
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs `
        -WindowStyle Hidden -PassThru -ErrorAction Stop
    $client = $null
    $clientExit = -1
    try {
        Wait-ProbeState 'admin-state' 'reader-ready' 300
        $previousProbeRoot = $env:CAP7CE_P37_PROBE_ROOT
        $env:CAP7CE_P37_PROBE_ROOT = $ProbeRoot
        try {
            $clientJson = & $clientExe '--core-p37-probe'
            $clientExit = $LASTEXITCODE
            if ($clientJson) { $client = $clientJson | ConvertFrom-Json }
        }
        finally {
            $env:CAP7CE_P37_PROBE_ROOT = $previousProbeRoot
        }
        [IO.File]::WriteAllText((Join-Path $ProbeRoot 'client-report.json'),
            (([ordered]@{ exitCode = $clientExit; report = $client }) | ConvertTo-Json -Depth 8 -Compress),
            [Text.UTF8Encoding]::new($false))
        $deadline = [DateTime]::UtcNow.AddMinutes(5)
        while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds 125
            $process.Refresh()
        }
        if (-not $process.HasExited) { throw [TimeoutException]::new('elevated-probe-timeout') }
    }
    finally {
        if (-not $process.HasExited) { $process.Kill() }
    }
    $adminPath = Join-Path $ProbeRoot 'admin-report.json'
    if (-not (Test-Path -LiteralPath $adminPath)) { throw [InvalidOperationException]::new('admin-report-missing') }
    $admin = Get-Content -LiteralPath $adminPath -Raw | ConvertFrom-Json
    $passed = $clientExit -eq 0 -and $null -ne $client -and $client.status -eq 'passed' -and
        $client.initialReady -and $client.offlineObserved -and $client.onlineCatchUp -and
        $client.journalRebuild -and $client.readerInterrupted -and $client.readerRestartRecovery -and
        $client.corruptCatalogRejected -and $client.catalogCleanupOk -and
        $admin.status -eq 'passed' -and $admin.cleanupOk -and
        -not $client.sourceFilesRead -and -not $client.readerSourceVolumeWritten -and -not $client.networkUsed
    $report = [ordered]@{
        status = if ($passed) { 'passed' } else { 'failed' }
        scope = 'disposable-dynamic-vhd'
        drive = 'fixed-probe-letter'
        client = $client
        system = $admin
        currentCatalogChanged = $false
        existingVolumesUsed = $false
        sourceFilesRead = $false
        readerSourceVolumeWritten = $false
        networkUsed = $false
    }
    $json = $report | ConvertTo-Json -Depth 10 -Compress
    [IO.File]::WriteAllText((Join-Path $ProbeRoot 'report.json'), $json, [Text.UTF8Encoding]::new($false))
    Write-Output $json
    if (-not $passed) { exit 10 }
    exit 0
}

$programCreated = $false
$dataCreated = $false
$serviceCreated = $false
$vhdCreated = $false
$vhdMounted = $false
$cleanupSafe = $true
$stage = 'preflight'
$vhdPath = Join-Path $ProbeRoot 'p37-recovery.vhdx'
$report = [ordered]@{
    status = 'failed'
    dynamicVhd = $false
    volumeOfflineOnline = $false
    journalReplaced = $false
    readerForceStopped = $false
    fixtureVolumeWritten = $false
    currentCatalogChanged = $false
    existingVolumesUsed = $false
    sourceFilesRead = $false
    readerSourceVolumeWritten = $false
    networkUsed = $false
    cleanupOk = $false
    errorStage = $null
    errorType = $null
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw [UnauthorizedAccessException]::new('requires-administrator')
    }
    $expectedBase = [IO.Path]::GetFullPath($probeBase).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $actualRoot = [IO.Path]::GetFullPath($ProbeRoot)
    if (-not $actualRoot.StartsWith($expectedBase, [StringComparison]::OrdinalIgnoreCase)) {
        throw [InvalidOperationException]::new('probe-root-outside-artifacts')
    }
    $probeItem = Get-Item -LiteralPath $actualRoot
    if ($probeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('probe-root-reparse')
    }
    if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
    if (Test-Path -LiteralPath "${driveLetter}:\") { throw [InvalidOperationException]::new('probe-drive-in-use') }
    foreach ($path in @($programDir, $dataDir, $vhdPath)) {
        if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('probe-path-already-exists') }
    }
    if ((Get-Sha256 $sourceReader) -ne $ExpectedReaderHash) {
        throw [InvalidOperationException]::new('source-hash-mismatch')
    }

    $stage = 'create-service'
    New-Item -ItemType Directory -Path $programDir | Out-Null
    $programCreated = $true
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    $dataCreated = $true
    Invoke-Sc @('create', $serviceName, 'binPath=', ('"' + $destinationReader + '"'),
        'start=', 'demand', 'obj=', 'LocalSystem', 'type=', 'own',
        'DisplayName=', 'Cap7CE Core Reader P3.7 Recovery Probe')
    $serviceCreated = $true
    Invoke-Sc @('sidtype', $serviceName, 'restricted')
    Invoke-Sc @('privs', $serviceName, 'SeChangeNotifyPrivilege')
    $serviceSid = ([Security.Principal.NTAccount]::new('NT SERVICE', $serviceName)).Translate([Security.Principal.SecurityIdentifier]).Value
    Set-ProtectedAcl $programDir $serviceSid 'RX'
    Set-ProtectedAcl $dataDir $serviceSid 'M'
    Copy-Item -LiteralPath $sourceReader -Destination $destinationReader
    if ((Get-Sha256 $destinationReader) -ne $ExpectedReaderHash) {
        throw [InvalidOperationException]::new('staged-hash-mismatch')
    }
    $allowedSid = $identity.User.Value
    Invoke-Sc @('sdset', $serviceName, "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x00000015;;;$allowedSid)")
    $config = [ordered]@{
        allowedSid = $allowedSid
        resultName = 'result-p37.json'
        waitSeconds = 900
        phase = 'volume'
        volumeLetters = @($driveLetter)
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $dataDir 'config.json'), $config, [Text.UTF8Encoding]::new($false))

    $stage = 'create-vhd'
    New-VHD -Path $vhdPath -Dynamic -SizeBytes 256MB | Out-Null
    $vhdCreated = $true
    $disk = Mount-VHD -Path $vhdPath -Passthru | Get-Disk
    $vhdMounted = $true
    $disk = Initialize-Disk -Number $disk.Number -PartitionStyle GPT -PassThru
    $partition = New-Partition -DiskNumber $disk.Number -UseMaximumSize -DriveLetter $driveLetter
    Format-Volume -DriveLetter $driveLetter -FileSystem NTFS -NewFileSystemLabel 'Cap7CEP37' -Confirm:$false | Out-Null
    & fsutil.exe usn createjournal m=33554432 a=8388608 "${driveLetter}:" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('journal-create-failed') }
    $token = Split-Path -Leaf $ProbeRoot
    $token = $token.Substring(4)
    $fixtureRoot = "${driveLetter}:\Cap7CE-P37-Probe-$token"
    New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixtureRoot "p37-base-$token.txt"), 'p37')
    $report.dynamicVhd = (Get-VHD -Path $vhdPath).VhdType -eq 'Dynamic'
    $report.fixtureVolumeWritten = $true
    Write-ProbeState 'admin-state' 'reader-ready'

    $stage = 'offline'
    Wait-ProbeState 'client-state' 'initial-complete' 300
    Wait-ServiceState 'Stopped' 30
    Dismount-VHD -Path $vhdPath
    $vhdMounted = $false
    Write-ProbeState 'admin-state' 'volume-offline'
    Wait-ProbeState 'client-state' 'offline-observed' 300
    Wait-ServiceState 'Stopped' 30

    $stage = 'online'
    Mount-VHD -Path $vhdPath | Out-Null
    $vhdMounted = $true
    $mountedDisk = Get-DiskImage -ImagePath $vhdPath | Get-Disk
    if ($mountedDisk.IsOffline) { Set-Disk -Number $mountedDisk.Number -IsOffline $false }
    $mountedPartition = $mountedDisk | Get-Partition | Where-Object Type -EQ 'Basic' | Select-Object -First 1
    if ($mountedPartition.DriveLetter -ne $driveLetter) {
        Set-Partition -DiskNumber $mountedDisk.Number -PartitionNumber $mountedPartition.PartitionNumber -NewDriveLetter $driveLetter
    }
    [IO.File]::WriteAllText((Join-Path $fixtureRoot "p37-online-$token.txt"), 'p37')
    Write-ProbeState 'admin-state' 'volume-online'
    Wait-ProbeState 'client-state' 'online-complete' 300
    Wait-ServiceState 'Stopped' 30
    $report.volumeOfflineOnline = $true

    $stage = 'journal-replace'
    & fsutil.exe usn deletejournal /D "${driveLetter}:" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('journal-delete-failed') }
    & fsutil.exe usn createjournal m=33554432 a=8388608 "${driveLetter}:" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('journal-recreate-failed') }
    [IO.File]::WriteAllText((Join-Path $fixtureRoot "p37-journal-$token.txt"), 'p37')
    Write-ProbeState 'admin-state' 'journal-replaced'
    Wait-ProbeState 'client-state' 'journal-complete' 300
    Wait-ServiceState 'Stopped' 30
    $report.journalReplaced = $true

    $stage = 'reader-kill'
    Wait-ProbeState 'client-state' 'reader-connected' 300
    $service = Get-ProbeService
    if ($null -eq $service -or $service.State -ne 'Running' -or $service.ProcessId -le 0) {
        throw [InvalidOperationException]::new('reader-process-missing')
    }
    Stop-Process -Id $service.ProcessId -Force
    Wait-ServiceState 'Stopped' 30
    $report.readerForceStopped = $true
    Write-ProbeState 'admin-state' 'reader-stopped'
    Wait-ProbeState 'client-state' 'client-complete' 300
    $report.status = 'passed'
}
catch {
    $report.errorStage = $stage
    $report.errorType = $_.Exception.GetType().Name
}
finally {
    try { Write-ProbeState 'admin-state' 'cleanup' } catch { }
    if ($serviceCreated) {
        try {
            $service = Get-ProbeService
            if ($null -ne $service -and -not $service.PathName.Contains($destinationReader)) {
                throw [InvalidOperationException]::new('service-path-changed')
            }
            if ($null -ne $service) {
                if ($service.State -ne 'Stopped') { Invoke-Sc @('stop', $serviceName); Wait-ServiceState 'Stopped' 30 }
                Invoke-Sc @('delete', $serviceName)
                Wait-ServiceState 'Deleted' 30
            }
        }
        catch { $cleanupSafe = $false }
    }
    if ($vhdMounted) {
        try { Dismount-VHD -Path $vhdPath; $vhdMounted = $false }
        catch { $cleanupSafe = $false }
    }
    if ($cleanupSafe -and $vhdCreated) {
        try {
            $actualVhd = [IO.Path]::GetFullPath($vhdPath)
            if (-not $actualVhd.StartsWith($expectedBase, [StringComparison]::OrdinalIgnoreCase) -or
                [IO.Path]::GetFileName($actualVhd) -ne 'p37-recovery.vhdx') {
                throw [InvalidOperationException]::new('vhd-cleanup-boundary')
            }
            Remove-Item -LiteralPath $actualVhd -Force
        }
        catch { $cleanupSafe = $false }
    }
    if ($cleanupSafe -and $programCreated) {
        try {
            $children = @(Get-ChildItem -LiteralPath $programDir -Force)
            if ($children.Count -ne 1 -or $children[0].Name -ne 'Cap7CE.Core.Reader.Host.exe' -or
                (Get-Sha256 $destinationReader) -ne $ExpectedReaderHash) {
                throw [InvalidOperationException]::new('program-cleanup-boundary')
            }
            Remove-Item -LiteralPath $destinationReader -Force
            Remove-Item -LiteralPath $programDir -Force
        }
        catch { $cleanupSafe = $false }
    }
    if ($cleanupSafe -and $dataCreated) {
        try {
            $children = @(Get-ChildItem -LiteralPath $dataDir -Force)
            $allowed = @('config.json', 'result-p37.json', 'result.pending.json')
            if (@($children | Where-Object Name -NotIn $allowed).Count -gt 0) {
                throw [InvalidOperationException]::new('data-cleanup-boundary')
            }
            foreach ($child in $children) { Remove-Item -LiteralPath $child.FullName -Force }
            Remove-Item -LiteralPath $dataDir -Force
        }
        catch { $cleanupSafe = $false }
    }
    $report.cleanupOk = $cleanupSafe -and -not (Get-ProbeService) -and
        -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir) -and
        -not (Test-Path -LiteralPath $vhdPath) -and -not (Test-Path -LiteralPath "${driveLetter}:\")
    [IO.File]::WriteAllText((Join-Path $ProbeRoot 'admin-report.json'),
        ($report | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
    try { Write-ProbeState 'admin-state' 'complete' } catch { }
}
