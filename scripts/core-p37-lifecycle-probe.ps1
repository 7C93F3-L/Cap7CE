param(
    [switch]$Elevated,
    [string]$RunRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = Join-Path $repoRoot 'core\artifacts\p37-lifecycle'
$v1Bundle = Join-Path $artifactRoot '1.0.0\bundle'
$v2Bundle = Join-Path $artifactRoot '1.0.1\bundle'
$serviceName = 'Cap7CENtfsReaderP37LifecycleProbe'
$productName = 'Cap7CE-P37-Lifecycle'
$coreProgram = Join-Path $env:ProgramFiles "$productName\Core\v1"
$readerProgram = Join-Path $env:ProgramFiles "$productName\NtfsReader\v1"
$readerData = Join-Path $env:ProgramData "$productName\NtfsReader\v1"
$stateDirectory = Join-Path $env:ProgramFiles "$productName\CapabilitySetup"
$catalogDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "$productName\Core"
$catalogProductDirectory = Split-Path -Parent $catalogDirectory
$currentCoreProgram = Join-Path $env:ProgramFiles 'Cap7CE\Core\v1'
$currentReaderProgram = Join-Path $env:ProgramFiles 'Cap7CE\NtfsReader\v1'
$currentReaderData = Join-Path $env:ProgramData 'Cap7CE\NtfsReader\v1'
$utf8 = [Text.UTF8Encoding]::new($false)

function Write-JsonFile([string]$Path, [object]$Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 10 -Compress), $utf8)
}

function Wait-JsonFile([string]$Path, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        if (Test-Path -LiteralPath $Path) {
            try { return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json }
            catch { }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new('probe-file-timeout')
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return [Security.Principal.WindowsPrincipal]::new($identity).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ProbeService {
    return Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
}

function Get-PathFingerprint([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 'absent' }
    $prefixLength = $Path.TrimEnd('\').Length
    return (@(Get-ChildItem -LiteralPath $Path -Recurse -Force | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            relative = $_.FullName.Substring($prefixLength).TrimStart('\')
            length = if ($_.PSIsContainer) { -1 } else { $_.Length }
            modified = $_.LastWriteTimeUtc.Ticks
        }
    }) | ConvertTo-Json -Depth 3 -Compress)
}

function Get-CurrentCapabilityFingerprint {
    $service = Get-CimInstance Win32_Service -Filter "Name='Cap7CENtfsReaderP33b2Probe'" `
        -ErrorAction SilentlyContinue
    return ([ordered]@{
        service = if ($service) { "$($service.PathName)|$($service.StartMode)" } else { 'absent' }
        core = Get-PathFingerprint $currentCoreProgram
        reader = Get-PathFingerprint $currentReaderProgram
        data = Get-PathFingerprint $currentReaderData
    } | ConvertTo-Json -Depth 4 -Compress)
}

function Wait-ServiceAbsent([int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        if (-not (Get-ProbeService)) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new('service-delete-timeout')
}

function Wait-ServiceStopped([int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq 'Stopped') { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new('service-stop-timeout')
}

function Remove-ProbeResidue {
    $service = Get-ProbeService
    if ($service) {
        $expected = Join-Path $readerProgram 'Cap7CE.Core.Reader.Host.exe'
        $actual = [Environment]::ExpandEnvironmentVariables($service.PathName.Trim()).Trim('"')
        if ([IO.Path]::GetFullPath($actual) -ine [IO.Path]::GetFullPath($expected)) {
            throw [InvalidOperationException]::new('cleanup-service-path-mismatch')
        }
        if ($service.State -ne 'Stopped') {
            & sc.exe stop $serviceName 2>&1 | Out-Null
            Wait-ServiceStopped 20
        }
        & sc.exe delete $serviceName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('cleanup-service-delete') }
        Wait-ServiceAbsent 20
    }
    foreach ($path in @($coreProgram, $readerProgram, $readerData, $stateDirectory,
        $catalogDirectory, $catalogProductDirectory)) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $item = Get-Item -LiteralPath $path
        if ($item.FullName -ine [IO.Path]::GetFullPath($path) -or
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw [InvalidOperationException]::new('cleanup-directory-boundary')
        }
        Remove-Item -LiteralPath $item.FullName -Recurse -Force
    }
}

if (-not $Elevated) {
    if (Test-IsAdministrator) { throw [InvalidOperationException]::new('outer-client-must-be-standard') }
    & node (Join-Path $repoRoot 'scripts\core-p37-lifecycle-payload-build.cjs')
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('p37-lifecycle-build-failed') }
    foreach ($bundle in @($v1Bundle, $v2Bundle)) {
        if (-not (Test-Path -LiteralPath (Join-Path $bundle 'Cap7CE.Core.Setup.exe'))) {
            throw [InvalidOperationException]::new('p37-lifecycle-bundle-missing')
        }
    }
    $RunRoot = Join-Path $artifactRoot ('probe\run-' + [Guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $RunRoot -Force)
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
        '-Elevated', '-RunRoot', ('"' + $RunRoot + '"'))
    $admin = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -PassThru `
        -ArgumentList $arguments
    $handled = 0
    $statePath = Join-Path $RunRoot 'state.json'
    while (-not $admin.HasExited) {
        if (Test-Path -LiteralPath $statePath) {
            try { $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json }
            catch { $state = $null }
            if ($state -and [int]$state.sequence -gt $handled) {
                $handled = [int]$state.sequence
                $replyPath = Join-Path $RunRoot ("client-$handled.json")
                if ($state.kind -eq 'activation') {
                    $output = & $state.setup --activation-client --pipe-name $state.pipeName `
                        --server-pid $state.serverPid --action $state.action --catalog $state.catalog 2>&1
                    $exitCode = $LASTEXITCODE
                }
                elseif ($state.kind -eq 'core') {
                    $saved = $ErrorActionPreference
                    $ErrorActionPreference = 'Continue'
                    $output = & $state.executable --reader-p37-lifecycle-client 2>&1
                    $exitCode = $LASTEXITCODE
                    $ErrorActionPreference = $saved
                }
                else { $output = '{"status":"failed","reason":"unknown-probe-state"}'; $exitCode = 9 }
                Write-JsonFile $replyPath ([ordered]@{
                    exitCode = $exitCode; output = (@($output) -join [Environment]::NewLine)
                })
            }
        }
        Start-Sleep -Milliseconds 100
        $admin.Refresh()
    }
    $admin.WaitForExit()
    $reportPath = Join-Path $RunRoot 'report.json'
    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw [InvalidOperationException]::new('admin-probe-no-report')
    }
    $reportText = Get-Content -Raw -LiteralPath $reportPath
    Write-Output $reportText
    if ($admin.ExitCode -ne 0 -or (ConvertFrom-Json $reportText).status -ne 'passed') { exit 8 }
    Remove-Item -LiteralPath $RunRoot -Recurse -Force
    exit 0
}

$report = [ordered]@{
    status = 'failed'; uacCount = 1; installV1 = $false; installStart = $false
    sameVersionRepair = $false; repairStart = $false; failedUpgradeRolledBack = $false
    rollbackKeptV1 = $false; rollbackStart = $false; upgradeV2 = $false; upgradeStart = $false
    preserveUninstall = $false; catalogPreserved = $false; reinstallV2 = $false
    removeCatalogUninstall = $false; zeroResidue = $false; currentCapabilityChanged = $false
    currentCatalogTargeted = $false; sourceFilesRead = $false; sourceVolumeWritten = $false
    networkUsed = $false; rebootRequested = $false; errorStage = $null; errorType = $null
}
$stage = 'preflight'
$sequence = 0
$mutationStarted = $false
$v1Setup = Join-Path $v1Bundle 'Cap7CE.Core.Setup.exe'
$v2Setup = Join-Path $v2Bundle 'Cap7CE.Core.Setup.exe'
$currentCapabilityBefore = $null

function Publish-State([System.Collections.IDictionary]$State) {
    [void]($script:sequence++)
    $State.sequence = $script:sequence
    Write-JsonFile (Join-Path $RunRoot 'state.json') $State
    return Join-Path $RunRoot ("client-$script:sequence.json")
}

function Invoke-Activation(
    [string]$Name, [string]$Setup, [string]$Action, [string]$Catalog,
    [bool]$InjectFailure, [bool]$ExpectSuccess) {
    $pipeName = 'cap7ce-setup-' + [Guid]::NewGuid().ToString('N')
    $mode = if ($InjectFailure) { '--activation-server-failure-probe' } else { '--activation-server' }
    $server = Start-Process -FilePath $Setup -WindowStyle Hidden -PassThru `
        -ArgumentList @($mode, '--pipe-name', $pipeName) `
        -RedirectStandardOutput (Join-Path $RunRoot "server-$Name.stdout.txt") `
        -RedirectStandardError (Join-Path $RunRoot "server-$Name.stderr.txt")
    $replyPath = Publish-State ([ordered]@{
        kind = 'activation'; name = $Name; setup = $Setup; pipeName = $pipeName
        serverPid = $server.Id; action = $Action; catalog = $Catalog
    })
    $reply = Wait-JsonFile $replyPath 300
    $response = $reply.output | ConvertFrom-Json
    if (-not $server.WaitForExit(60000)) {
        Stop-Process -Id $server.Id -Force
        throw [TimeoutException]::new('activation-server-timeout')
    }
    $server.WaitForExit()
    $success = $response.status -eq 'passed' -and $response.transactionStatus -eq 'succeeded' -and
        $response.systemChangesCommitted -and -not $response.cleanupRequired -and [int]$reply.exitCode -eq 0
    $rolledBack = $response.status -eq 'failed' -and $response.transactionStatus -eq 'rolledBack' -and
        $response.failedStage -eq 'applyDataPermissions' -and -not $response.systemChangesCommitted -and
        -not $response.cleanupRequired -and [int]$reply.exitCode -eq 4
    if (($ExpectSuccess -and -not $success) -or (-not $ExpectSuccess -and -not $rolledBack)) {
        throw [InvalidOperationException]::new("activation-$Name-result")
    }
}

function Invoke-CoreClient([string]$Name) {
    $resultPath = Join-Path $readerData 'result-p33b2.json'
    Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
    $corePath = Join-Path $coreProgram 'Cap7CE.Core.Host.exe'
    $reply = Wait-JsonFile (Publish-State ([ordered]@{
        kind = 'core'; name = $Name; executable = $corePath
    })) 120
    $client = $reply.output | ConvertFrom-Json
    if ([int]$reply.exitCode -ne 0 -or $client.status -ne 'passed' -or
        -not $client.clientStandard -or -not $client.serviceStartedByClient -or
        -not $client.prohibitedServiceRightsDenied -or -not $client.serviceAuthenticated -or
        -not $client.expectedBinaryPath -or -not $client.demandStart -or
        $client.elevationRequested -or $client.sourceFilesRead -or
        $client.sourceVolumeWritten -or $client.networkUsed) {
        throw [InvalidOperationException]::new("core-client-$Name-result")
    }
    $serviceResult = Wait-JsonFile $resultPath 30
    Wait-ServiceStopped 20
    if ($serviceResult.status -ne 'client-disconnected' -or
        -not $serviceResult.restrictedServiceToken -or -not $serviceResult.remoteClientsRejected -or
        $serviceResult.sourceVolumeMetadataRead -or $serviceResult.sourceFilesRead -or
        $serviceResult.networkUsed) {
        throw [InvalidOperationException]::new("reader-service-$Name-result")
    }
    return $true
}

function Get-InstalledVersion {
    return (Get-Content -Raw -LiteralPath (Join-Path $stateDirectory 'ownership.json') |
        ConvertFrom-Json).capabilityVersion
}

try {
    if (-not (Test-IsAdministrator)) { throw [UnauthorizedAccessException]::new('requires-administrator') }
    $expectedRoot = [IO.Path]::GetFullPath((Join-Path $artifactRoot 'probe')).TrimEnd('\') + '\'
    if (-not ([IO.Path]::GetFullPath($RunRoot)).StartsWith(
        $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw [InvalidOperationException]::new('probe-root-boundary')
    }
    if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
    foreach ($path in @($coreProgram, $readerProgram, $readerData, $stateDirectory, $catalogDirectory)) {
        if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('target-already-exists') }
    }
    if (Test-Path -LiteralPath $catalogProductDirectory) {
        $existingParent = Get-Item -LiteralPath $catalogProductDirectory
        if ($existingParent.FullName -ine [IO.Path]::GetFullPath($catalogProductDirectory) -or
            ($existingParent.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            @(Get-ChildItem -LiteralPath $catalogProductDirectory -Force).Count -ne 0) {
            throw [InvalidOperationException]::new('catalog-parent-boundary')
        }
    }
    $currentCapabilityBefore = Get-CurrentCapabilityFingerprint
    $stage = 'install-v1'; $mutationStarted = $true
    Invoke-Activation 'install-v1' $v1Setup 'enable' 'preserve' $false $true
    $report.installV1 = (Get-InstalledVersion) -eq '1.0.0'
    $stage = 'install-start'; $report.installStart = Invoke-CoreClient 'install-v1'

    $stage = 'same-version-repair'
    Invoke-Activation 'repair-v1' $v1Setup 'repair' 'preserve' $false $true
    $report.sameVersionRepair = (Get-InstalledVersion) -eq '1.0.0'
    $stage = 'repair-start'; $report.repairStart = Invoke-CoreClient 'repair-v1'

    $stage = 'failed-upgrade-rollback'
    Invoke-Activation 'failed-upgrade-v2' $v2Setup 'repair' 'preserve' $true $false
    $report.failedUpgradeRolledBack = $true
    $marker = Join-Path $coreProgram 'capability-version.txt'
    $report.rollbackKeptV1 = (Get-InstalledVersion) -eq '1.0.0' -and
        (Get-Content -Raw -LiteralPath $marker).Trim() -eq '1.0.0'
    $stage = 'rollback-start'; $report.rollbackStart = Invoke-CoreClient 'rollback-v1'

    $stage = 'upgrade-v2'
    Invoke-Activation 'upgrade-v2' $v2Setup 'repair' 'preserve' $false $true
    $report.upgradeV2 = (Get-InstalledVersion) -eq '1.0.1' -and
        (Get-Content -Raw -LiteralPath $marker).Trim() -eq '1.0.1'
    $stage = 'upgrade-start'; $report.upgradeStart = Invoke-CoreClient 'upgrade-v2'

    [void](New-Item -ItemType Directory -Path $catalogDirectory -Force)
    [IO.File]::WriteAllText((Join-Path $catalogDirectory 'preserve-sentinel.txt'), 'p37', $utf8)
    $stage = 'preserve-uninstall'
    Invoke-Activation 'remove-preserve' $v2Setup 'remove' 'preserve' $false $true
    $report.preserveUninstall = -not (Get-ProbeService) -and
        @($coreProgram, $readerProgram, $readerData, $stateDirectory).Where({ Test-Path -LiteralPath $_ }).Count -eq 0
    $report.catalogPreserved = Test-Path -LiteralPath (Join-Path $catalogDirectory 'preserve-sentinel.txt')

    $stage = 'reinstall-v2'
    Invoke-Activation 'reinstall-v2' $v2Setup 'enable' 'preserve' $false $true
    $report.reinstallV2 = (Get-InstalledVersion) -eq '1.0.1'
    $stage = 'remove-catalog-uninstall'
    Invoke-Activation 'remove-catalog' $v2Setup 'remove' 'remove' $false $true
    $report.removeCatalogUninstall = -not (Test-Path -LiteralPath $catalogDirectory)
    $report.zeroResidue = -not (Get-ProbeService) -and
        @($coreProgram, $readerProgram, $readerData, $stateDirectory,
            $catalogDirectory, $catalogProductDirectory).Where({
            Test-Path -LiteralPath $_
        }).Count -eq 0
    if (@($report.installV1, $report.installStart, $report.sameVersionRepair,
        $report.repairStart, $report.failedUpgradeRolledBack, $report.rollbackKeptV1,
        $report.rollbackStart, $report.upgradeV2, $report.upgradeStart,
        $report.preserveUninstall, $report.catalogPreserved, $report.reinstallV2,
        $report.removeCatalogUninstall, $report.zeroResidue).Where({ -not $_ }).Count -ne 0) {
        throw [InvalidOperationException]::new('lifecycle-assertion-failed')
    }
    $report.status = 'passed'
}
catch {
    $report.errorStage = $stage
    $report.errorType = $_.Exception.GetType().Name
    if ($_.Exception.Message -match '^[a-z0-9-]+$') { $report.errorCode = $_.Exception.Message }
}
finally {
    if ($report.status -ne 'passed' -and $mutationStarted) {
        try { Remove-ProbeResidue }
        catch { $report.cleanupError = $_.Exception.GetType().Name }
    }
    if ($currentCapabilityBefore) {
        $report.currentCapabilityChanged = $currentCapabilityBefore -ne (Get-CurrentCapabilityFingerprint)
    }
    if ($report.status -eq 'passed' -and $report.currentCapabilityChanged) {
        $report.status = 'failed'
        $report.errorStage = 'current-boundary'
        $report.errorType = 'InvalidOperationException'
        $report.errorCode = 'current-product-boundary-changed'
    }
    Write-JsonFile (Join-Path $RunRoot 'report.json') $report
}

if ($report.status -ne 'passed') { exit 8 }
exit 0
