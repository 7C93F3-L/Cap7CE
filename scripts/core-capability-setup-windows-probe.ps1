param(
    [switch]$Elevated,
    [string]$RunRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bundleRoot = Join-Path $repoRoot 'core\artifacts\capability\v1\bundle'
$setupPath = Join-Path $bundleRoot 'Cap7CE.Core.Setup.exe'
$serviceName = 'Cap7CENtfsReaderP33b2Probe'
$coreProgram = Join-Path $env:ProgramFiles 'Cap7CE\Core\v1'
$readerProgram = Join-Path $env:ProgramFiles 'Cap7CE\NtfsReader\v1'
$readerData = Join-Path $env:ProgramData 'Cap7CE\NtfsReader\v1'
$stateDirectory = Join-Path $env:ProgramFiles 'Cap7CE\CapabilitySetup\p33b2'
$catalogDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Cap7CE\Core'
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
        $actual = [Environment]::ExpandEnvironmentVariables($service.PathName.Trim())
        if ($actual.StartsWith('"') -and $actual.EndsWith('"')) { $actual = $actual.Trim('"') }
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

    foreach ($path in @($coreProgram, $readerProgram, $readerData, $stateDirectory)) {
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
    & npm.cmd run publish:core-capability
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $setupPath)) {
        throw [InvalidOperationException]::new('capability-publish-failed')
    }

    $RunRoot = Join-Path $repoRoot ('core\artifacts\capability\v1\probe\run-' + [Guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $RunRoot -Force)
    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
        '-Elevated', '-RunRoot', ('"' + $RunRoot + '"'))
    $admin = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -PassThru `
        -ArgumentList $arguments
    $handledSequence = 0
    $statePath = Join-Path $RunRoot 'state.json'
    while (-not $admin.HasExited) {
        if (Test-Path -LiteralPath $statePath) {
            try { $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json }
            catch { $state = $null }
            if ($state -and [int]$state.sequence -gt $handledSequence) {
                $handledSequence = [int]$state.sequence
                $replyPath = Join-Path $RunRoot ("client-$handledSequence.json")
                if ($state.kind -eq 'activation') {
                    $output = & $setupPath --activation-client --pipe-name $state.pipeName `
                        --server-pid $state.serverPid --action $state.action --catalog $state.catalog 2>&1
                    $exitCode = $LASTEXITCODE
                }
                elseif ($state.kind -eq 'core') {
                    $savedPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; $output = & $state.executable --reader-capability-lifecycle-client 2>&1; $exitCode = $LASTEXITCODE; $ErrorActionPreference = $savedPreference
                }
                else {
                    $output = '{"status":"failed","reason":"unknown-probe-state"}'
                    $exitCode = 9
                }
                Write-JsonFile $replyPath ([ordered]@{
                    exitCode = $exitCode
                    output = (@($output) -join [Environment]::NewLine)
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
    status = 'failed'
    uacCount = 1
    enable = $false
    ordinaryStart = $false
    repair = $false
    repairStart = $false
    failureRolledBack = $false
    rollbackPreservedService = $false
    remove = $false
    serviceRemoved = $false
    directoriesRemoved = $false
    catalogPreserved = $false
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
    errorStage = $null
    errorType = $null
}
$stage = 'preflight'
$sequence = 0
$mutationStarted = $false
$catalogExistedBefore = Test-Path -LiteralPath $catalogDirectory

function Publish-State([System.Collections.IDictionary]$State) {
    [void]($script:sequence++)
    $State.sequence = $script:sequence
    Write-JsonFile (Join-Path $RunRoot 'state.json') $State
    return Join-Path $RunRoot ("client-$script:sequence.json")
}

function Invoke-Activation(
    [string]$Name,
    [string]$Action,
    [string]$Catalog,
    [bool]$InjectFailure,
    [bool]$ExpectSuccess) {
    $pipeName = 'cap7ce-setup-' + [Guid]::NewGuid().ToString('N')
    $mode = if ($InjectFailure) { '--activation-server-failure-probe' } else { '--activation-server' }
    $serverOut = Join-Path $RunRoot ("server-$Name.stdout.txt")
    $serverErr = Join-Path $RunRoot ("server-$Name.stderr.txt")
    $server = Start-Process -FilePath $setupPath -WindowStyle Hidden -PassThru `
        -ArgumentList @($mode, '--pipe-name', $pipeName) `
        -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr
    $replyPath = Publish-State ([ordered]@{
        kind = 'activation'; name = $Name; pipeName = $pipeName; serverPid = $server.Id
        action = $Action; catalog = $Catalog
    })
    $reply = Wait-JsonFile $replyPath 300
    $response = $reply.output | ConvertFrom-Json
    if (-not $server.WaitForExit(60000)) {
        Stop-Process -Id $server.Id -Force; throw [TimeoutException]::new('activation-server-timeout')
    }
    $server.WaitForExit()
    $success = $response.status -eq 'passed' -and $response.transactionStatus -eq 'succeeded' -and
        $response.systemChangesCommitted -and -not $response.cleanupRequired -and
        [int]$reply.exitCode -eq 0
    $rolledBack = $response.status -eq 'failed' -and $response.transactionStatus -eq 'rolledBack' -and
        $response.failedStage -eq 'applyDataPermissions' -and -not $response.systemChangesCommitted -and
        -not $response.cleanupRequired -and [int]$reply.exitCode -eq 4
    if (($ExpectSuccess -and -not $success) -or (-not $ExpectSuccess -and -not $rolledBack)) {
        throw [InvalidOperationException]::new("activation-$Name-result")
    }
    return $response
}

function Invoke-CoreClient([string]$Name) {
    $resultPath = Join-Path $readerData 'result-p33b2.json'
    Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
    $corePath = Join-Path $coreProgram 'Cap7CE.Core.Host.exe'
    $replyPath = Publish-State ([ordered]@{ kind = 'core'; name = $Name; executable = $corePath })
    $reply = Wait-JsonFile $replyPath 120
    $client = $reply.output | ConvertFrom-Json
    if ([int]$reply.exitCode -ne 0 -or $client.status -ne 'passed' -or
        -not $client.clientStandard -or -not $client.serviceStartedByClient -or
        -not $client.prohibitedServiceRightsDenied -or -not $client.serviceAuthenticated -or
        -not $client.expectedBinaryPath -or -not $client.expectedBinaryVersion -or
        -not $client.demandStart -or $client.elevationRequested -or
        $client.sourceFilesRead -or $client.sourceVolumeWritten -or $client.networkUsed) {
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

try {
    if (-not (Test-IsAdministrator)) { throw [UnauthorizedAccessException]::new('requires-administrator') }
    $expectedProbeBase = [IO.Path]::GetFullPath((Join-Path $repoRoot 'core\artifacts\capability\v1\probe')).TrimEnd('\') + '\'
    $actualRunRoot = [IO.Path]::GetFullPath($RunRoot)
    if (-not $actualRunRoot.StartsWith($expectedProbeBase, [StringComparison]::OrdinalIgnoreCase) -or
        (Get-Item -LiteralPath $actualRunRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('probe-root-boundary')
    }
    if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
    foreach ($path in @($coreProgram, $readerProgram, $readerData, $stateDirectory)) {
        if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('target-already-exists') }
    }

    $stage = 'enable'
    $mutationStarted = $true
    [void](Invoke-Activation 'enable' 'enable' 'preserve' $false $true)
    $report.enable = $true
    $stage = 'ordinary-start'
    $report.ordinaryStart = Invoke-CoreClient 'enable'

    $stage = 'repair'
    [void](Invoke-Activation 'repair' 'repair' 'preserve' $false $true)
    $report.repair = $true
    $stage = 'repair-start'
    $report.repairStart = Invoke-CoreClient 'repair'

    $stage = 'failure-rollback'
    [void](Invoke-Activation 'failure' 'repair' 'preserve' $true $false)
    $report.failureRolledBack = $true
    $stage = 'rollback-preserved-service'
    $report.rollbackPreservedService = Invoke-CoreClient 'rollback'

    $stage = 'remove'
    [void](Invoke-Activation 'remove' 'remove' 'preserve' $false $true)
    $report.remove = $true
    $stage = 'zero-residue'
    $report.serviceRemoved = -not (Get-ProbeService)
    $report.directoriesRemoved = @($coreProgram, $readerProgram, $readerData, $stateDirectory).Where({
        Test-Path -LiteralPath $_
    }).Count -eq 0
    $report.catalogPreserved = (Test-Path -LiteralPath $catalogDirectory) -eq $catalogExistedBefore
    if (-not ($report.serviceRemoved -and $report.directoriesRemoved -and $report.catalogPreserved)) {
        throw [InvalidOperationException]::new('zero-residue-failed')
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
    $report.serviceRemoved = -not (Get-ProbeService)
    $report.directoriesRemoved = @($coreProgram, $readerProgram, $readerData, $stateDirectory).Where({
        Test-Path -LiteralPath $_
    }).Count -eq 0
    Write-JsonFile (Join-Path $RunRoot 'report.json') $report
}

if ($report.status -ne 'passed') { exit 8 }
exit 0
