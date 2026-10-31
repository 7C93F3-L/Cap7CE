param(
    [switch]$Elevated,
    [switch]$InitialOnly,
    [string]$ProbeRoot,
    [string]$ExpectedHash
)

$ErrorActionPreference = 'Stop'
$serviceName = 'Cap7CECoreReaderP21Probe'
$programName = 'Cap7CE-Core-Reader-P21-Probe'
$dataName = 'Cap7CE-Core-Reader-P21-Probe'
$repoRoot = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $repoRoot 'core\artifacts\reader-p31\publish'
$sourceExe = Join-Path $publishDir 'Cap7CE.Core.Reader.Host.exe'
$clientExe = Join-Path $repoRoot 'core\artifacts\bin\Cap7CE.Core.Host\Release\net10.0-windows\Cap7CE.Core.Host.exe'
$programDir = Join-Path $env:ProgramFiles $programName
$destinationExe = Join-Path $programDir 'Cap7CE.Core.Reader.Host.exe'
$dataDir = Join-Path $env:ProgramData $dataName
$probeBase = Join-Path $repoRoot 'core\artifacts\reader-p31\probe'

function Invoke-Sc([string[]]$Arguments) {
    & sc.exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('sc-failed') }
}

function Get-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) }
    finally { $stream.Dispose(); $algorithm.Dispose() }
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

function Write-State([string]$Phase) {
    $pending = Join-Path $ProbeRoot 'state.pending.json'
    [IO.File]::WriteAllText($pending,
        (@{ phase = $Phase } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $pending -Destination (Join-Path $ProbeRoot 'state.json') -Force
}

if (-not $Elevated) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw [InvalidOperationException]::new('outer-probe-must-be-standard')
    }
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_NOLOGO = '1'
    & dotnet build (Join-Path $repoRoot 'core\Cap7CE.Core.sln') --configuration Release --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('core-build-failed') }
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Reader.Host\Cap7CE.Core.Reader.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained true --nologo `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
        --output $publishDir | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sourceExe)) {
        throw [InvalidOperationException]::new('reader-publish-failed')
    }
    if (-not (Test-Path -LiteralPath $clientExe)) { throw [InvalidOperationException]::new('core-client-missing') }

    New-Item -ItemType Directory -Path $probeBase -Force | Out-Null
    $runRoot = Join-Path $probeBase ("run-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    $hash = Get-Sha256 $sourceExe
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
        '-Elevated', '-ProbeRoot', $runRoot, '-ExpectedHash', $hash)
    if ($InitialOnly) { $arguments += '-InitialOnly' }
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs `
        -WindowStyle Hidden -PassThru -ErrorAction Stop
    $client = $null
    $clientStarted = $false
    $deadline = [DateTime]::UtcNow.AddMinutes(40)
    while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        $statePath = Join-Path $runRoot 'state.json'
        if (-not $clientStarted -and (Test-Path -LiteralPath $statePath)) {
            $phase = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).phase
            if ($phase -eq 'reader-ready') {
                $clientStarted = $true
                if ($InitialOnly) {
                    $clientJson = & $clientExe '--core-p31-initial-probe'
                }
                else {
                    $clientJson = & $clientExe '--core-p31-probe'
                }
                $clientExit = $LASTEXITCODE
                if ($clientJson) { $client = $clientJson | ConvertFrom-Json }
                $clientReportPath = Join-Path $runRoot 'client-report.json'
                [IO.File]::WriteAllText($clientReportPath,
                    (([ordered]@{ exitCode = $clientExit; report = $client }) | ConvertTo-Json -Depth 8 -Compress),
                    [Text.UTF8Encoding]::new($false))
            }
        }
        Start-Sleep -Milliseconds 250
        $process.Refresh()
    }
    if (-not $process.HasExited) { throw [TimeoutException]::new('elevated-probe-timeout') }
    $adminPath = Join-Path $runRoot 'admin-report.json'
    if (-not (Test-Path -LiteralPath $adminPath)) { throw [InvalidOperationException]::new('admin-report-missing') }
    $admin = Get-Content -LiteralPath $adminPath -Raw | ConvertFrom-Json
    $clientPassed = if ($InitialOnly) {
        $null -ne $client -and $client.status -eq 'passed' -and $client.initialOnly -and
            $client.initialBuildPassed -and $client.basicFactsConsistent -and
            $client.directChildrenPassed -and $client.descendantsPassed -and $client.pagingPassed -and
            $client.catalogIntegrityOk -and $client.controlledFixtureCleanupOk -and $client.catalogCleanupOk -and
            -not $client.sourceFilesRead -and -not $client.readerSourceVolumeWritten -and -not $client.networkUsed
    }
    else {
        $null -ne $client -and $client.status -eq 'passed' -and
            $client.closedPeriodChangesCaughtUp -and $client.renameStable -and $client.moveStable -and
            $client.deleteRemoved -and $client.basicFactsConsistent -and $client.directChildrenPassed -and
            $client.descendantsPassed -and $client.savedScopePassed -and $client.pagingPassed -and
            $client.discontinuityDetected -and $client.rebuildPassed -and $client.catalogIntegrityOk -and
            $client.controlledFixtureCleanupOk -and $client.catalogCleanupOk -and
            -not $client.sourceFilesRead -and -not $client.readerSourceVolumeWritten -and -not $client.networkUsed
    }
    $passed = $clientPassed -and $admin.status -eq 'passed' -and $admin.cleanupOk
    $report = [ordered]@{
        status = if ($passed) { 'passed' } else { 'failed' }
        scope = if ($InitialOnly) { 'authorized-fixed-ntfs-volume-initial-only' } else { 'authorized-fixed-ntfs-volume' }
        client = $client
        service = $admin
        sourceFilesRead = $false
        readerSourceVolumeWritten = $false
        networkUsed = $false
    }
    $json = $report | ConvertTo-Json -Depth 10 -Compress
    [IO.File]::WriteAllText((Join-Path $runRoot 'report.json'), $json, [Text.UTF8Encoding]::new($false))
    Write-Output $json
    if (-not $passed) { exit 8 }
    exit 0
}

$programCreated = $false
$dataCreated = $false
$serviceCreated = $false
$cleanupSafe = $true
$stage = 'preflight'
$report = [ordered]@{
    status = 'failed'
    demandStart = $false
    restrictedServiceSid = $false
    minimalPrivileges = $false
    serviceDaclNarrow = $false
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
    cleanupOk = $false
    readerStatus = $null
    readerStage = $null
    errorStage = $null
    errorType = $null
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw [UnauthorizedAccessException]::new('requires-administrator')
    }
    $expectedProbeBase = [IO.Path]::GetFullPath($probeBase).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $actualProbeRoot = [IO.Path]::GetFullPath($ProbeRoot)
    if (-not $actualProbeRoot.StartsWith($expectedProbeBase, [StringComparison]::OrdinalIgnoreCase)) {
        throw [InvalidOperationException]::new('probe-root-outside-artifacts')
    }
    $probeItem = Get-Item -LiteralPath $actualProbeRoot
    if ($probeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('probe-root-reparse')
    }
    if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
    foreach ($path in @($programDir, $dataDir)) {
        if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('probe-path-already-exists') }
    }
    if ((Get-Sha256 $sourceExe) -ne $ExpectedHash) {
        throw [InvalidOperationException]::new('source-hash-mismatch')
    }
    $script:allowedSid = $identity.User.Value

    $stage = 'create-service'
    New-Item -ItemType Directory -Path $programDir | Out-Null
    $programCreated = $true
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    $dataCreated = $true
    Invoke-Sc @('create', $serviceName, 'binPath=', ('"' + $destinationExe + '"'),
        'start=', 'demand', 'obj=', 'LocalSystem', 'type=', 'own',
        'DisplayName=', 'Cap7CE Core Reader P3.1 Probe')
    $serviceCreated = $true
    Invoke-Sc @('sidtype', $serviceName, 'restricted')
    Invoke-Sc @('privs', $serviceName, 'SeChangeNotifyPrivilege')
    $serviceSid = ([Security.Principal.NTAccount]::new('NT SERVICE', $serviceName)).Translate([Security.Principal.SecurityIdentifier]).Value
    Set-ProtectedAcl $programDir $serviceSid 'RX'
    Set-ProtectedAcl $dataDir $serviceSid 'M'
    Copy-Item -LiteralPath $sourceExe -Destination $destinationExe
    if ((Get-Sha256 $destinationExe) -ne $ExpectedHash) {
        throw [InvalidOperationException]::new('staged-hash-mismatch')
    }
    $serviceSddl = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x00000015;;;$script:allowedSid)"
    Invoke-Sc @('sdset', $serviceName, $serviceSddl)

    $stage = 'write-config'
    $config = [ordered]@{
        allowedSid = $script:allowedSid
        resultName = 'result-p31.json'
        waitSeconds = 1800
        phase = 'volume'
        volumeLetters = @('E')
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $dataDir 'config.json'), $config, [Text.UTF8Encoding]::new($false))

    $serviceConfig = Get-ProbeService
    $report.demandStart = $serviceConfig.StartMode -eq 'Manual'
    $report.restrictedServiceSid = $true
    $report.minimalPrivileges = $true
    $report.serviceDaclNarrow = $true
    Write-State 'reader-ready'

    $stage = 'wait-client'
    $clientPath = Join-Path $ProbeRoot 'client-report.json'
    $deadline = [DateTime]::UtcNow.AddMinutes(35)
    while (-not (Test-Path -LiteralPath $clientPath) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }
    if (-not (Test-Path -LiteralPath $clientPath)) { throw [TimeoutException]::new('client-report') }
    $clientEnvelope = Get-Content -LiteralPath $clientPath -Raw | ConvertFrom-Json
    if ($clientEnvelope.exitCode -ne 0 -or $clientEnvelope.report.status -ne 'passed') {
        $serviceResultPath = Join-Path $dataDir 'result-p31.json'
        if (Test-Path -LiteralPath $serviceResultPath) {
            $serviceResult = Get-Content -LiteralPath $serviceResultPath -Raw | ConvertFrom-Json
            $report.readerStatus = $serviceResult.status
            $report.readerStage = $serviceResult.stage
        }
        throw [InvalidOperationException]::new('client-failed')
    }
    $service = Get-ProbeService
    if ($null -ne $service -and $service.State -ne 'Stopped') { Wait-ServiceState 'Stopped' 30 }
    $serviceResultPath = Join-Path $dataDir 'result-p31.json'
    if (-not (Test-Path -LiteralPath $serviceResultPath)) {
        throw [InvalidOperationException]::new('service-result-missing')
    }
    $serviceResult = Get-Content -LiteralPath $serviceResultPath -Raw | ConvertFrom-Json
    $report.readerStatus = $serviceResult.status
    $report.readerStage = $serviceResult.stage
    if ($serviceResult.status -ne 'passed' -or -not $serviceResult.sourceVolumeMetadataRead -or
        $serviceResult.sourceFilesRead -or $serviceResult.sourceVolumeWritten -or $serviceResult.networkUsed) {
        throw [InvalidOperationException]::new('service-result-failed')
    }
    $report.status = 'passed'
}
catch {
    $report.errorStage = $stage
    $report.errorType = $_.Exception.GetType().Name
}
finally {
    Write-State 'cleanup'
    if ($serviceCreated) {
        try {
            $service = Get-ProbeService
            if ($null -ne $service -and -not $service.PathName.Contains($destinationExe)) {
                throw [InvalidOperationException]::new('service-path-changed')
            }
            if ($null -ne $service) {
                if ($service.State -ne 'Stopped') { Invoke-Sc @('stop', $serviceName); Wait-ServiceState 'Stopped' 30 }
                Invoke-Sc @('delete', $serviceName)
                Wait-ServiceState 'Deleted' 30
            }
        }
        catch {
            $cleanupSafe = $false
            if ($null -eq $report.errorStage) { $report.errorStage = 'cleanup-service'; $report.errorType = $_.Exception.GetType().Name }
        }
    }
    if ($cleanupSafe -and $programCreated) {
        try {
            $item = Get-Item -LiteralPath $programDir
            $children = @(Get-ChildItem -LiteralPath $programDir -Force)
            if ($item.FullName -ine $programDir -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                $children.Count -ne 1 -or $children[0].Name -ne 'Cap7CE.Core.Reader.Host.exe' -or
                (Get-Sha256 $destinationExe) -ne $ExpectedHash) {
                throw [InvalidOperationException]::new('program-cleanup-boundary')
            }
            Remove-Item -LiteralPath $destinationExe -Force
            Remove-Item -LiteralPath $programDir -Force
        }
        catch {
            $cleanupSafe = $false
            if ($null -eq $report.errorStage) { $report.errorStage = 'cleanup-program'; $report.errorType = $_.Exception.GetType().Name }
        }
    }
    if ($cleanupSafe -and $dataCreated) {
        try {
            $item = Get-Item -LiteralPath $dataDir
            $allowed = @('config.json', 'result-p31.json', 'result.pending.json')
            $children = @(Get-ChildItem -LiteralPath $dataDir -Force)
            if ($item.FullName -ine $dataDir -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                @($children | Where-Object Name -NotIn $allowed).Count -gt 0) {
                throw [InvalidOperationException]::new('data-cleanup-boundary')
            }
            foreach ($child in $children) { Remove-Item -LiteralPath $child.FullName -Force }
            Remove-Item -LiteralPath $dataDir -Force
        }
        catch {
            $cleanupSafe = $false
            if ($null -eq $report.errorStage) { $report.errorStage = 'cleanup-data'; $report.errorType = $_.Exception.GetType().Name }
        }
    }
    $report.cleanupOk = $cleanupSafe -and -not (Get-ProbeService) -and
        -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir)
    [IO.File]::WriteAllText((Join-Path $ProbeRoot 'admin-report.json'),
        ($report | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
    Write-State 'complete'
}
