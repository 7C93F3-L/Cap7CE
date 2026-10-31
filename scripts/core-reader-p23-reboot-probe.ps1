param(
    [ValidateSet('prepare', 'resume', 'elevated-prepare', 'elevated-cleanup')]
    [string]$Mode = 'prepare',
    [string]$ReaderHash,
    [string]$ClientHash,
    [string]$CleanupToken
)

$ErrorActionPreference = 'Stop'
$serviceName = 'Cap7CENtfsReaderP23Probe'
$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $repoRoot 'core\artifacts\reader-p23-reboot'
$readerPublishDir = Join-Path $artifactRoot 'reader'
$clientPublishDir = Join-Path $artifactRoot 'client'
$sourceReader = Join-Path $readerPublishDir 'Cap7CE.Core.Reader.Host.exe'
$sourceClient = Join-Path $clientPublishDir 'Cap7CE.Core.Host.exe'
$statePath = Join-Path $artifactRoot 'state.json'
$adminReportPath = Join-Path $artifactRoot 'admin-report.json'
$markerName = '.cap7ce-p23-reboot-probe'
$programCap7CE = Join-Path $env:ProgramFiles 'Cap7CE'
$programReader = Join-Path $programCap7CE 'NtfsReader'
$programDir = Join-Path $programReader 'v1'
$destinationReader = Join-Path $programDir 'Cap7CE.Core.Reader.Host.exe'
$destinationClient = Join-Path $programDir 'Cap7CE.Core.Host.exe'
$dataCap7CE = Join-Path $env:ProgramData 'Cap7CE'
$dataReader = Join-Path $dataCap7CE 'NtfsReader'
$dataDir = Join-Path $dataReader 'v1'
$resultPath = Join-Path $dataDir 'result-reboot.json'

function Get-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Get-BootTicks {
    return (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime.ToUniversalTime().Ticks
}

function Get-ProbeService {
    return Get-CimInstance -ClassName Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
}

function Invoke-Sc([string[]]$Arguments) {
    & sc.exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw [InvalidOperationException]::new("sc-$($Arguments[0])-failed-$LASTEXITCODE")
    }
}

function Wait-ServiceState([string]$State, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $service = Get-ProbeService
        if ($null -eq $service -and $State -eq 'Deleted') { return }
        if ($null -ne $service -and $service.State -eq $State) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw [TimeoutException]::new("service-state-$State")
}

function Test-FixedServicePath($Service) {
    if ($null -eq $Service) { return $false }
    $actual = $Service.PathName.Trim().Trim('"')
    return [IO.Path]::GetFullPath($actual) -ieq [IO.Path]::GetFullPath($destinationReader)
}

function Set-ProtectedAcl([string]$Path, [string[]]$Grants) {
    $arguments = @($Path, '/inheritance:r', '/grant:r') + $Grants
    & icacls.exe @arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('acl-failed') }
}

function Test-ProtectedAcl([string]$Path, [string[]]$ExpectedSids) {
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) { return $false }
    $actual = @($acl.Access | ForEach-Object {
        $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    } | Sort-Object -Unique)
    $expected = @($ExpectedSids | Sort-Object -Unique)
    return (Compare-Object $actual $expected).Count -eq 0 -and
        @($acl.Access | Where-Object { $_.AccessControlType -ne 'Allow' -or $_.IsInherited }).Count -eq 0
}

function Test-ServiceDacl([string]$AllowedSid) {
    $actualSddl = (& sc.exe sdshow $serviceName | Where-Object { $_ -match '^D:' } | Select-Object -First 1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $actualSddl) { return $false }
    $descriptor = [Security.AccessControl.CommonSecurityDescriptor]::new($false, $false, $actualSddl)
    $aces = @($descriptor.DiscretionaryAcl | ForEach-Object {
        [pscustomobject]@{
            Sid = $_.SecurityIdentifier.Value
            Mask = [uint32]$_.AccessMask
            Allow = $_.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed
        }
    })
    $fullMasks = @([uint32]0x10000000, [uint32]0x000F01FF)
    $systemAce = @($aces | Where-Object Sid -eq 'S-1-5-18')
    $adminAce = @($aces | Where-Object Sid -eq 'S-1-5-32-544')
    $userAce = @($aces | Where-Object Sid -eq $AllowedSid)
    return $aces.Count -eq 3 -and
        $systemAce.Count -eq 1 -and $systemAce[0].Allow -and $systemAce[0].Mask -in $fullMasks -and
        $adminAce.Count -eq 1 -and $adminAce[0].Allow -and $adminAce[0].Mask -in $fullMasks -and
        $userAce.Count -eq 1 -and $userAce[0].Allow -and $userAce[0].Mask -eq [uint32]0x15
}

function Ensure-MarkedDirectory([string]$Path, [string]$Token) {
    if (Test-Path -LiteralPath $Path) {
        if (Test-Path -LiteralPath (Join-Path $Path $markerName)) {
            throw [InvalidOperationException]::new('stale-probe-marker')
        }
        return
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
    [IO.File]::WriteAllText((Join-Path $Path $markerName), $Token, [Text.UTF8Encoding]::new($false))
}

function Remove-MarkedParent([string]$Path, [string]$Token) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('parent-reparse')
    }
    $markerPath = Join-Path $Path $markerName
    if (-not (Test-Path -LiteralPath $markerPath)) { return }
    if ([IO.File]::ReadAllText($markerPath) -cne $Token) {
        throw [InvalidOperationException]::new('parent-marker-mismatch')
    }
    $children = @(Get-ChildItem -LiteralPath $Path -Force)
    if ($children.Count -ne 1 -or $children[0].Name -cne $markerName) {
        throw [InvalidOperationException]::new('parent-not-empty')
    }
    Remove-Item -LiteralPath $markerPath -Force
    Remove-Item -LiteralPath $Path -Force
}

function Remove-ProbeInstallation([string]$ExpectedReaderHash, [string]$ExpectedClientHash, [string]$Token) {
    $service = Get-ProbeService
    if ($null -ne $service) {
        if (-not (Test-FixedServicePath $service)) {
            throw [InvalidOperationException]::new('cleanup-service-path')
        }
        if ($service.State -ne 'Stopped') {
            Invoke-Sc @('stop', $serviceName)
            Wait-ServiceState 'Stopped' 15
        }
        Invoke-Sc @('delete', $serviceName)
        Wait-ServiceState 'Deleted' 15
    }

    if (Test-Path -LiteralPath $programDir) {
        $item = Get-Item -LiteralPath $programDir
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw [InvalidOperationException]::new('cleanup-program-reparse')
        }
        $allowed = @('Cap7CE.Core.Reader.Host.exe', 'Cap7CE.Core.Host.exe', $markerName)
        $children = @(Get-ChildItem -LiteralPath $programDir -Force)
        if (@($children | Where-Object Name -NotIn $allowed).Count -gt 0) {
            throw [InvalidOperationException]::new('cleanup-program-children')
        }
        $markerPath = Join-Path $programDir $markerName
        if (-not (Test-Path -LiteralPath $markerPath) -or [IO.File]::ReadAllText($markerPath) -cne $Token) {
            throw [InvalidOperationException]::new('cleanup-program-marker')
        }
        if ((Test-Path -LiteralPath $destinationReader) -and (Get-Sha256 $destinationReader) -ne $ExpectedReaderHash) {
            throw [InvalidOperationException]::new('cleanup-reader-hash')
        }
        if ((Test-Path -LiteralPath $destinationClient) -and (Get-Sha256 $destinationClient) -ne $ExpectedClientHash) {
            throw [InvalidOperationException]::new('cleanup-client-hash')
        }
        foreach ($child in $children) { Remove-Item -LiteralPath $child.FullName -Force }
        Remove-Item -LiteralPath $programDir -Force
    }

    if (Test-Path -LiteralPath $dataDir) {
        $item = Get-Item -LiteralPath $dataDir
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw [InvalidOperationException]::new('cleanup-data-reparse')
        }
        $allowed = @('config.json', 'result.pending.json', 'result-reboot.json', $markerName)
        $children = @(Get-ChildItem -LiteralPath $dataDir -Force)
        if (@($children | Where-Object Name -NotIn $allowed).Count -gt 0) {
            throw [InvalidOperationException]::new('cleanup-data-children')
        }
        $markerPath = Join-Path $dataDir $markerName
        if (-not (Test-Path -LiteralPath $markerPath) -or [IO.File]::ReadAllText($markerPath) -cne $Token) {
            throw [InvalidOperationException]::new('cleanup-data-marker')
        }
        foreach ($child in $children) { Remove-Item -LiteralPath $child.FullName -Force }
        Remove-Item -LiteralPath $dataDir -Force
    }

    foreach ($parent in @($dataReader, $dataCap7CE, $programReader, $programCap7CE)) {
        Remove-MarkedParent $parent $Token
    }
}

function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
}

function Test-Unauthorized([scriptblock]$Operation) {
    try {
        & $Operation
        return $false
    }
    catch {
        $errorValue = $_.Exception
        while ($null -ne $errorValue.InnerException) { $errorValue = $errorValue.InnerException }
        if ($errorValue -is [UnauthorizedAccessException]) { return $true }
        throw
    }
}

function Invoke-Elevated([string]$Action, [string]$ExpectedReaderHash, [string]$ExpectedClientHash, [string]$Token) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
        '-Mode', $Action, '-ReaderHash', $ExpectedReaderHash,
        '-ClientHash', $ExpectedClientHash, '-CleanupToken', $Token)
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs `
        -WindowStyle Hidden -PassThru -ErrorAction Stop
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw [InvalidOperationException]::new("$Action-failed-$($process.ExitCode)")
    }
}

if ($Mode -in @('elevated-prepare', 'elevated-cleanup')) {
    if (-not (Get-IsAdministrator)) { throw [UnauthorizedAccessException]::new('requires-administrator') }
    New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    $report = [ordered]@{ status = 'failed'; action = $Mode; cleanupOk = $false; error = $null }
    $installed = $false
    try {
        if ($ReaderHash -notmatch '^[A-F0-9]{64}$' -or $ClientHash -notmatch '^[A-F0-9]{64}$' -or
            $CleanupToken -notmatch '^[a-f0-9]{32}$') {
            throw [InvalidOperationException]::new('invalid-elevated-arguments')
        }
        if ($Mode -eq 'elevated-cleanup') {
            Remove-ProbeInstallation $ReaderHash $ClientHash $CleanupToken
            $report.status = 'passed'
            $report.cleanupOk = $null -eq (Get-ProbeService) -and
                -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir)
            if (-not $report.cleanupOk) { throw [InvalidOperationException]::new('cleanup-residue') }
            Write-Json $adminReportPath $report
            exit 0
        }

        if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
        foreach ($path in @($programDir, $dataDir)) {
            if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('target-already-exists') }
        }
        if ((Get-Sha256 $sourceReader) -ne $ReaderHash -or (Get-Sha256 $sourceClient) -ne $ClientHash) {
            throw [InvalidOperationException]::new('source-hash-mismatch')
        }

        foreach ($path in @($programCap7CE, $programReader, $programDir, $dataCap7CE, $dataReader, $dataDir)) {
            Ensure-MarkedDirectory $path $CleanupToken
        }
        Copy-Item -LiteralPath $sourceReader -Destination $destinationReader
        Copy-Item -LiteralPath $sourceClient -Destination $destinationClient
        Invoke-Sc @('create', $serviceName, 'binPath=', ('"' + $destinationReader + '"'),
            'start=', 'demand', 'obj=', 'LocalSystem', 'type=', 'own',
            'DisplayName=', 'Cap7CE NTFS Reader P2.3 Reboot Probe')
        $installed = $true
        Invoke-Sc @('sidtype', $serviceName, 'restricted')
        Invoke-Sc @('privs', $serviceName, 'SeChangeNotifyPrivilege')

        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $allowedSid = $identity.User.Value
        $trustedInstallerSid = ([Security.Principal.NTAccount]::new('NT SERVICE', 'TrustedInstaller')).Translate([Security.Principal.SecurityIdentifier]).Value
        $serviceSid = ([Security.Principal.NTAccount]::new('NT SERVICE', $serviceName)).Translate([Security.Principal.SecurityIdentifier]).Value
        Set-ProtectedAcl $programDir @(
            '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
            "*${trustedInstallerSid}:(OI)(CI)F", '*S-1-5-32-545:(OI)(CI)RX',
            "*${serviceSid}:(OI)(CI)RX")
        Set-ProtectedAcl $dataDir @(
            '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
            "*${trustedInstallerSid}:(OI)(CI)F", "*${serviceSid}:(OI)(CI)M")
        Invoke-Sc @('sdset', $serviceName,
            "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x00000015;;;$allowedSid)")
        $config = [ordered]@{
            allowedSid = $allowedSid
            resultName = 'result-reboot.json'
            waitSeconds = 30
            phase = 'fixture'
            volumeLetter = $null
        }
        Write-Json (Join-Path $dataDir 'config.json') $config

        $service = Get-ProbeService
        $programAcl = Test-ProtectedAcl $programDir @(
            'S-1-5-18', 'S-1-5-32-544', $trustedInstallerSid, 'S-1-5-32-545', $serviceSid)
        $dataAcl = Test-ProtectedAcl $dataDir @(
            'S-1-5-18', 'S-1-5-32-544', $trustedInstallerSid, $serviceSid)
        $ready = (Test-FixedServicePath $service) -and $service.State -eq 'Stopped' -and
            $service.StartMode -eq 'Manual' -and $service.StartName -eq 'LocalSystem' -and
            (Test-ServiceDacl $allowedSid) -and $programAcl -and $dataAcl
        if (-not $ready) { throw [InvalidOperationException]::new('prepared-boundary-mismatch') }
        $report.status = 'passed'
        $report.cleanupOk = $false
        Write-Json $adminReportPath $report
        exit 0
    }
    catch {
        $report.error = if ($_.Exception.Message -match '^[a-z0-9-]+$') { $_.Exception.Message } else { $_.Exception.GetType().Name }
        if ($Mode -eq 'elevated-prepare') {
            try {
                Remove-ProbeInstallation $ReaderHash $ClientHash $CleanupToken
                $report.cleanupOk = $null -eq (Get-ProbeService) -and
                    -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir)
            }
            catch { $report.cleanupOk = $false }
        }
        Write-Json $adminReportPath $report
        exit 9
    }
}

if (Get-IsAdministrator) { throw [InvalidOperationException]::new('outer-probe-must-be-standard') }

if ($Mode -eq 'prepare') {
    New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    $existingService = Get-ProbeService
    $recoverPrepared = $null -ne $existingService -and
        -not (Test-Path -LiteralPath $statePath) -and
        (Test-Path -LiteralPath $adminReportPath) -and
        (Test-Path -LiteralPath $sourceReader) -and (Test-Path -LiteralPath $sourceClient) -and
        (Test-Path -LiteralPath (Join-Path $programDir $markerName)) -and
        (Test-Path -LiteralPath $dataDir)
    if ($recoverPrepared) {
        $priorAdmin = Get-Content -LiteralPath $adminReportPath -Raw | ConvertFrom-Json
        $recoverPrepared = $priorAdmin.status -eq 'passed'
    }
    if (-not $recoverPrepared) {
        if ($null -ne $existingService) { throw [InvalidOperationException]::new('service-already-exists') }
        foreach ($path in @($programDir, $dataDir)) {
            if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('target-already-exists') }
        }
        $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
        $env:DOTNET_NOLOGO = '1'
        & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Reader.Host\Cap7CE.Core.Reader.Host.csproj') `
            --configuration Release --runtime win-x64 --self-contained true --nologo `
            -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
            -p:P23LifecycleProfile=true -p:Version=1.0.0 -p:AssemblyVersion=1.0.0.0 `
            -p:FileVersion=1.0.0.0 -p:InformationalVersion=1.0.0 --output $readerPublishDir | Out-Null
        if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('reader-publish-failed') }
        & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Host\Cap7CE.Core.Host.csproj') `
            --configuration Release --runtime win-x64 --self-contained true --nologo `
            -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
            -p:Version=1.0.0 -p:AssemblyVersion=1.0.0.0 -p:FileVersion=1.0.0.0 `
            -p:InformationalVersion=1.0.0 --output $clientPublishDir | Out-Null
        if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('client-publish-failed') }
    }
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo($sourceReader).FileVersion -ne '1.0.0.0') {
        throw [InvalidOperationException]::new('reader-version-mismatch')
    }

    $readerHashValue = Get-Sha256 $sourceReader
    $clientHashValue = Get-Sha256 $sourceClient
    $token = if ($recoverPrepared) {
        [IO.File]::ReadAllText((Join-Path $programDir $markerName))
    } else {
        [Guid]::NewGuid().ToString('N')
    }
    if ($token -notmatch '^[a-f0-9]{32}$') { throw [InvalidDataException]::new('cleanup-token-invalid') }
    $beforeBootTicks = Get-BootTicks
    if (-not $recoverPrepared) {
        Invoke-Elevated 'elevated-prepare' $readerHashValue $clientHashValue $token
    }
    $admin = Get-Content -LiteralPath $adminReportPath -Raw | ConvertFrom-Json
    if ($admin.status -ne 'passed') { throw [InvalidOperationException]::new('prepare-admin-report') }

    $service = Get-ProbeService
    $serviceStatus = Get-Service -Name $serviceName -ErrorAction Stop
    $programWriteDenied = Test-Unauthorized {
        [IO.File]::WriteAllText((Join-Path $programDir 'standard-write.tmp'), 'denied')
    }
    $dataReadDenied = Test-Unauthorized {
        [void][IO.File]::ReadAllText((Join-Path $dataDir 'config.json'))
    }
    $ready = $service.State -eq 'Stopped' -and $service.ExitCode -eq 1077 -and
        $serviceStatus.Status -eq 'Stopped' -and $serviceStatus.StartType -eq 'Manual' -and
        $programWriteDenied -and $dataReadDenied -and
        (Get-Sha256 $destinationReader) -eq $readerHashValue -and
        (Get-Sha256 $destinationClient) -eq $clientHashValue -and
        -not (Test-Path -LiteralPath $resultPath)
    if (-not $ready) { throw [InvalidOperationException]::new('prepare-standard-boundary') }

    $state = [ordered]@{
        phase = 'ready-for-reboot'
        beforeBootTicks = $beforeBootTicks.ToString()
        readerHash = $readerHashValue
        clientHash = $clientHashValue
        cleanupToken = $token
    }
    Write-Json $statePath $state
    Write-Output (([ordered]@{
        status = 'ready-for-reboot'
        serviceStopped = $true
        demandStart = $true
        standardProgramWriteDenied = $true
        standardConfigReadDenied = $true
        sourceFilesRead = $false
        sourceVolumeWritten = $false
        networkUsed = $false
    }) | ConvertTo-Json -Compress)
    exit 0
}

if (-not (Test-Path -LiteralPath $statePath)) { throw [IO.FileNotFoundException]::new('reboot-state-missing') }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.phase -ne 'ready-for-reboot' -or $state.readerHash -notmatch '^[A-F0-9]{64}$' -or
    $state.clientHash -notmatch '^[A-F0-9]{64}$' -or $state.cleanupToken -notmatch '^[a-f0-9]{32}$' -or
    $state.beforeBootTicks -notmatch '^\d+$') {
    throw [InvalidDataException]::new('reboot-state-invalid')
}
$currentBootTicks = Get-BootTicks
if ($currentBootTicks -le [long]$state.beforeBootTicks) {
    throw [InvalidOperationException]::new('windows-reboot-not-observed')
}
$service = Get-ProbeService
$serviceStatus = Get-Service -Name $serviceName -ErrorAction Stop
$noAutomaticStart = $service.State -eq 'Stopped' -and $service.ExitCode -eq 1077 -and
    $serviceStatus.Status -eq 'Stopped' -and $serviceStatus.StartType -eq 'Manual'
$installPersisted = $noAutomaticStart -and
    (Get-Sha256 $destinationReader) -eq $state.readerHash -and
    (Get-Sha256 $destinationClient) -eq $state.clientHash -and
    [Diagnostics.FileVersionInfo]::GetVersionInfo($destinationReader).FileVersion -eq '1.0.0.0'
if (-not $installPersisted) { throw [InvalidOperationException]::new('reboot-persistence-boundary') }

$client = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $client.status -ne 'passed' -or -not $client.clientStandard -or
    -not $client.serviceStartedByClient -or -not $client.prohibitedServiceRightsDenied -or
    -not $client.serviceAuthenticated -or -not $client.expectedBinaryPath -or
    -not $client.expectedBinaryVersion -or -not $client.demandStart -or
    -not $client.remoteClientsRejected -or $client.elevationRequested) {
    throw [InvalidOperationException]::new('post-reboot-client-boundary')
}
Wait-ServiceState 'Stopped' 15
$state.phase = 'verified-awaiting-cleanup'
Write-Json $statePath $state
Invoke-Elevated 'elevated-cleanup' $state.readerHash $state.clientHash $state.cleanupToken
$admin = Get-Content -LiteralPath $adminReportPath -Raw | ConvertFrom-Json
if ($admin.status -ne 'passed' -or -not $admin.cleanupOk) {
    throw [InvalidOperationException]::new('cleanup-admin-report')
}
$cleanupOk = $null -eq (Get-ProbeService) -and
    -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir)
if (-not $cleanupOk) { throw [InvalidOperationException]::new('post-reboot-cleanup-residue') }
$state.phase = 'complete'
Write-Json $statePath $state
Write-Output (([ordered]@{
    status = 'passed'
    rebootObserved = $true
    noAutomaticStart = $true
    installPersisted = $true
    standardClientStartedService = $true
    serviceStoppedAfterIdle = $true
    cleanupOk = $true
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
}) | ConvertTo-Json -Compress)
