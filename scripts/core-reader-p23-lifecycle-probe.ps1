param(
    [switch]$Elevated,
    [string]$ProbeRoot,
    [string]$ReaderV1Hash,
    [string]$ReaderV2Hash,
    [string]$ClientHash
)

$ErrorActionPreference = 'Stop'
$serviceName = 'Cap7CENtfsReaderP23Probe'
$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $repoRoot 'core\artifacts\reader-p23'
$readerV1Dir = Join-Path $artifactRoot 'reader-v1'
$readerV2Dir = Join-Path $artifactRoot 'reader-v2'
$clientPublishDir = Join-Path $artifactRoot 'client'
$sourceReaderV1 = Join-Path $readerV1Dir 'Cap7CE.Core.Reader.Host.exe'
$sourceReaderV2 = Join-Path $readerV2Dir 'Cap7CE.Core.Reader.Host.exe'
$sourceClient = Join-Path $clientPublishDir 'Cap7CE.Core.Host.exe'
$programCap7CE = Join-Path $env:ProgramFiles 'Cap7CE'
$programReader = Join-Path $programCap7CE 'NtfsReader'
$programDir = Join-Path $programReader 'v1'
$destinationReader = Join-Path $programDir 'Cap7CE.Core.Reader.Host.exe'
$destinationClient = Join-Path $programDir 'Cap7CE.Core.Host.exe'
$dataCap7CE = Join-Path $env:ProgramData 'Cap7CE'
$dataReader = Join-Path $dataCap7CE 'NtfsReader'
$dataDir = Join-Path $dataReader 'v1'
$probeBase = Join-Path $artifactRoot 'probe'

function Get-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Invoke-Sc([string[]]$Arguments) {
    & sc.exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw [InvalidOperationException]::new("sc-$($Arguments[0])-failed-$LASTEXITCODE")
    }
}

function Get-ProbeService {
    Get-CimInstance -ClassName Win32_Service -Filter "Name='$serviceName'" -ErrorAction Stop
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

function Write-State([string]$Phase) {
    [IO.File]::WriteAllText((Join-Path $ProbeRoot 'state.json'),
        (@{ phase = $Phase } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
}

function Wait-JsonFile([string]$Name, [int]$Seconds) {
    $path = Join-Path $ProbeRoot $Name
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while (-not (Test-Path -LiteralPath $path) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $path)) { throw [TimeoutException]::new("wait-$Name") }
    return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function Write-ServiceConfig([string]$ResultName, [int]$WaitSeconds) {
    $config = [ordered]@{
        allowedSid = $script:allowedSid
        resultName = $ResultName
        waitSeconds = $WaitSeconds
        phase = 'fixture'
        volumeLetter = $null
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $dataDir 'config.json'), $config, [Text.UTF8Encoding]::new($false))
}

function Wait-ServiceResult([string]$Name, [string]$ExpectedStatus, [int]$Seconds) {
    $path = Join-Path $dataDir $Name
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while (-not (Test-Path -LiteralPath $path) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $path)) { throw [TimeoutException]::new("result-$Name") }
    $result = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($result.status -ne $ExpectedStatus) { throw [InvalidOperationException]::new("status-$Name") }
    return $result
}

function Ensure-Directory([string]$Path, [Collections.Generic.List[string]]$Created) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
        $Created.Add($Path)
    }
    $item = Get-Item -LiteralPath $Path
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('directory-reparse')
    }
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

if (-not $Elevated) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw [InvalidOperationException]::new('outer-probe-must-be-standard')
    }
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_NOLOGO = '1'
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Reader.Host\Cap7CE.Core.Reader.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained true --nologo `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
        -p:P23LifecycleProfile=true `
        -p:Version=1.0.0 -p:AssemblyVersion=1.0.0.0 -p:FileVersion=1.0.0.0 `
        -p:InformationalVersion=1.0.0 --output $readerV1Dir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('reader-v1-publish-failed') }
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Reader.Host\Cap7CE.Core.Reader.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained true --nologo `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
        -p:P23LifecycleProfile=true `
        -p:Version=2.0.0 -p:AssemblyVersion=2.0.0.0 -p:FileVersion=2.0.0.0 `
        -p:InformationalVersion=2.0.0 --output $readerV2Dir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('reader-v2-publish-failed') }
    & dotnet publish (Join-Path $repoRoot 'core\src\Cap7CE.Core.Host\Cap7CE.Core.Host.csproj') `
        --configuration Release --runtime win-x64 --self-contained true --nologo `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
        -p:Version=1.0.0 -p:AssemblyVersion=1.0.0.0 -p:FileVersion=1.0.0.0 `
        -p:InformationalVersion=1.0.0 --output $clientPublishDir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw [InvalidOperationException]::new('client-publish-failed') }
    foreach ($path in @($sourceReaderV1, $sourceReaderV2, $sourceClient)) {
        if (-not (Test-Path -LiteralPath $path)) { throw [IO.FileNotFoundException]::new('publish-output-missing') }
    }
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo($sourceReaderV1).FileVersion -ne '1.0.0.0' -or
        [Diagnostics.FileVersionInfo]::GetVersionInfo($sourceReaderV2).FileVersion -ne '2.0.0.0') {
        throw [InvalidOperationException]::new('publish-version-mismatch')
    }

    New-Item -ItemType Directory -Path $probeBase -Force | Out-Null
    $runRoot = Join-Path $probeBase ("run-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
        '-Elevated', '-ProbeRoot', $runRoot,
        '-ReaderV1Hash', (Get-Sha256 $sourceReaderV1),
        '-ReaderV2Hash', (Get-Sha256 $sourceReaderV2),
        '-ClientHash', (Get-Sha256 $sourceClient))
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs `
        -WindowStyle Hidden -PassThru -ErrorAction Stop
    $seen = [Collections.Generic.HashSet[string]]::new()
    $clients = [ordered]@{}
    $boundary = [ordered]@{ programWriteDenied = $false; dataReadDenied = $false }
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        $statePath = Join-Path $runRoot 'state.json'
        if (Test-Path -LiteralPath $statePath) {
            $phase = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).phase
            if ($seen.Add($phase)) {
                if ($phase -eq 'on-demand-ready') {
                    try { [IO.File]::WriteAllText((Join-Path $programDir 'standard-write.tmp'), 'denied') }
                    catch [UnauthorizedAccessException] { $boundary.programWriteDenied = $true }
                    try { [void][IO.File]::ReadAllText((Join-Path $dataDir 'config.json')) }
                    catch [UnauthorizedAccessException] { $boundary.dataReadDenied = $true }
                    $clients.onDemand = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
                    [IO.File]::WriteAllText((Join-Path $runRoot 'client-on-demand.json'),
                        ($clients.onDemand | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
                }
                elseif ($phase -eq 'duplicate-ready') {
                    $clients.duplicate = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
                    [IO.File]::WriteAllText((Join-Path $runRoot 'client-duplicate.json'),
                        ($clients.duplicate | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
                }
                elseif ($phase -eq 'crash-restart-ready') {
                    $clients.crashRestart = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
                    [IO.File]::WriteAllText((Join-Path $runRoot 'client-crash-restart.json'),
                        ($clients.crashRestart | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
                }
                elseif ($phase -eq 'version-mismatch-ready') {
                    $clients.versionMismatch = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
                    [IO.File]::WriteAllText((Join-Path $runRoot 'client-version-mismatch.json'),
                        ($clients.versionMismatch | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
                }
                elseif ($phase -eq 'rollback-ready') {
                    $clients.rollback = (& $destinationClient --reader-lifecycle-client | ConvertFrom-Json)
                    [IO.File]::WriteAllText((Join-Path $runRoot 'client-rollback.json'),
                        ($clients.rollback | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
                }
            }
        }
        Start-Sleep -Milliseconds 100
        $process.Refresh()
    }
    if (-not $process.HasExited) { throw [TimeoutException]::new('elevated-probe-timeout') }
    $adminPath = Join-Path $runRoot 'admin-report.json'
    if (-not (Test-Path -LiteralPath $adminPath)) { throw [InvalidOperationException]::new('admin-report-missing') }
    $admin = Get-Content -LiteralPath $adminPath -Raw | ConvertFrom-Json
    $passed = $admin.status -eq 'passed' -and $admin.cleanupOk -and
        $boundary.programWriteDenied -and $boundary.dataReadDenied -and
        $clients.onDemand.status -eq 'passed' -and $clients.onDemand.serviceStartedByClient -and
        $clients.onDemand.prohibitedServiceRightsDenied -and -not $clients.onDemand.elevationRequested -and
        $clients.duplicate.status -eq 'passed' -and $clients.duplicate.serviceAlreadyRunning -and
        $clients.crashRestart.status -eq 'passed' -and $clients.crashRestart.serviceStartedByClient -and
        $clients.versionMismatch.status -eq 'repair-required' -and
        $clients.versionMismatch.reason -eq 'service-version-mismatch' -and
        -not $clients.versionMismatch.serviceStartedByClient -and
        $clients.rollback.status -eq 'passed' -and $clients.rollback.serviceStartedByClient
    $report = [ordered]@{
        status = if ($passed) { 'passed' } else { 'failed' }
        standardBoundary = $boundary
        clients = $clients
        service = $admin
        sourceFilesRead = $false
        sourceVolumeWritten = $false
        networkUsed = $false
    }
    $json = $report | ConvertTo-Json -Depth 10 -Compress
    [IO.File]::WriteAllText((Join-Path $runRoot 'report.json'), $json, [Text.UTF8Encoding]::new($false))
    Write-Output $json
    if (-not $passed) { exit 8 }
    exit 0
}

$createdDirectories = [Collections.Generic.List[string]]::new()
$serviceCreated = $false
$temporaryUser = $null
$cleanupSafe = $true
$stage = 'preflight'
$report = [ordered]@{
    status = 'failed'
    programAclProtected = $false
    dataAclProtected = $false
    serviceDaclExact = $false
    demandStart = $false
    localSystem = $false
    idleStop = $false
    timeoutStop = $false
    duplicateStartRejected = $false
    crashStopped = $false
    crashRestarted = $false
    secondAccountServiceDenied = $false
    secondAccountPipeDenied = $false
    temporaryAccountRemoved = $true
    versionMismatchRejectedBeforeStart = $false
    upgradeRollbackRestored = $false
    freshClientProcessRestarted = $false
    uninstallServiceRemoved = $false
    uninstallProgramRemoved = $false
    uninstallConfigRemoved = $false
    cleanupOk = $false
    sourceFilesRead = $false
    sourceVolumeWritten = $false
    networkUsed = $false
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
    if ((Get-Item -LiteralPath $actualProbeRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw [InvalidOperationException]::new('probe-root-reparse')
    }
    if (Get-ProbeService) { throw [InvalidOperationException]::new('service-already-exists') }
    foreach ($path in @($programDir, $dataDir)) {
        if (Test-Path -LiteralPath $path) { throw [InvalidOperationException]::new('target-already-exists') }
    }
    if ((Get-Sha256 $sourceReaderV1) -ne $ReaderV1Hash -or
        (Get-Sha256 $sourceReaderV2) -ne $ReaderV2Hash -or
        (Get-Sha256 $sourceClient) -ne $ClientHash) {
        throw [InvalidOperationException]::new('source-hash-mismatch')
    }
    $script:allowedSid = $identity.User.Value
    $trustedInstallerSid = ([Security.Principal.NTAccount]::new('NT SERVICE', 'TrustedInstaller')).Translate([Security.Principal.SecurityIdentifier]).Value
    $usersSid = 'S-1-5-32-545'
    $systemSid = 'S-1-5-18'
    $adminsSid = 'S-1-5-32-544'

    $stage = 'install-layout'
    foreach ($path in @($programCap7CE, $programReader, $programDir, $dataCap7CE, $dataReader, $dataDir)) {
        Ensure-Directory $path $createdDirectories
    }
    Copy-Item -LiteralPath $sourceReaderV1 -Destination $destinationReader
    Copy-Item -LiteralPath $sourceClient -Destination $destinationClient
    Invoke-Sc @('create', $serviceName,
        'binPath=', ('"' + $destinationReader + '"'),
        'start=', 'demand', 'obj=', 'LocalSystem', 'type=', 'own',
        'DisplayName=', 'Cap7CE NTFS Reader P2.3 Probe')
    $serviceCreated = $true
    Invoke-Sc @('sidtype', $serviceName, 'restricted')
    Invoke-Sc @('privs', $serviceName, 'SeChangeNotifyPrivilege')
    $serviceSid = ([Security.Principal.NTAccount]::new('NT SERVICE', $serviceName)).Translate([Security.Principal.SecurityIdentifier]).Value
    Set-ProtectedAcl $programDir @(
        "*${systemSid}:(OI)(CI)F", "*${adminsSid}:(OI)(CI)F",
        "*${trustedInstallerSid}:(OI)(CI)F", "*${usersSid}:(OI)(CI)RX",
        "*${serviceSid}:(OI)(CI)RX")
    Set-ProtectedAcl $dataDir @(
        "*${systemSid}:(OI)(CI)F", "*${adminsSid}:(OI)(CI)F",
        "*${trustedInstallerSid}:(OI)(CI)F", "*${serviceSid}:(OI)(CI)M")
    $serviceSddl = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x00000015;;;$script:allowedSid)"
    Invoke-Sc @('sdset', $serviceName, $serviceSddl)
    $actualSddl = (& sc.exe sdshow $serviceName | Where-Object { $_ -match '^D:' } | Select-Object -First 1).Trim()
    $descriptor = [Security.AccessControl.CommonSecurityDescriptor]::new($false, $false, $actualSddl)
    $serviceAces = @($descriptor.DiscretionaryAcl | ForEach-Object {
        [pscustomobject]@{
            Sid = $_.SecurityIdentifier.Value
            Mask = [uint32]$_.AccessMask
            Allow = $_.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed
        }
    })
    $systemAce = @($serviceAces | Where-Object Sid -eq $systemSid)
    $adminAce = @($serviceAces | Where-Object Sid -eq $adminsSid)
    $userAce = @($serviceAces | Where-Object Sid -eq $script:allowedSid)
    $fullMasks = @([uint32]0x10000000, [uint32]0x000F01FF)
    $report.serviceDaclExact = $serviceAces.Count -eq 3 -and
        $systemAce.Count -eq 1 -and $systemAce[0].Allow -and $systemAce[0].Mask -in $fullMasks -and
        $adminAce.Count -eq 1 -and $adminAce[0].Allow -and $adminAce[0].Mask -in $fullMasks -and
        $userAce.Count -eq 1 -and $userAce[0].Allow -and $userAce[0].Mask -eq [uint32]0x15
    $report.programAclProtected = Test-ProtectedAcl $programDir @($systemSid, $adminsSid, $trustedInstallerSid, $usersSid, $serviceSid)
    $report.dataAclProtected = Test-ProtectedAcl $dataDir @($systemSid, $adminsSid, $trustedInstallerSid, $serviceSid)
    $serviceConfig = Get-ProbeService
    $report.demandStart = $serviceConfig.StartMode -eq 'Manual'
    $report.localSystem = $serviceConfig.StartName -eq 'LocalSystem'
    if (-not ($report.serviceDaclExact -and $report.programAclProtected -and
        $report.dataAclProtected -and $report.demandStart -and $report.localSystem)) {
        throw [InvalidOperationException]::new('hardened-boundary-mismatch')
    }

    $stage = 'ordinary-on-demand-start'
    Write-ServiceConfig 'result-on-demand.json' 30
    Write-State 'on-demand-ready'
    $onDemand = Wait-JsonFile 'client-on-demand.json' 45
    [void](Wait-ServiceResult 'result-on-demand.json' 'passed' 20)
    Wait-ServiceState 'Stopped' 15
    $report.idleStop = $onDemand.status -eq 'passed' -and $onDemand.serviceStartedByClient -and
        $onDemand.prohibitedServiceRightsDenied -and -not $onDemand.elevationRequested

    $stage = 'duplicate-start'
    Write-ServiceConfig 'result-duplicate.json' 30
    Invoke-Sc @('start', $serviceName)
    Wait-ServiceState 'Running' 10
    & sc.exe start $serviceName 2>&1 | Out-Null
    $duplicateExit = $LASTEXITCODE
    $report.duplicateStartRejected = $duplicateExit -eq 1056
    Write-State 'duplicate-ready'
    $duplicate = Wait-JsonFile 'client-duplicate.json' 45
    [void](Wait-ServiceResult 'result-duplicate.json' 'passed' 20)
    Wait-ServiceState 'Stopped' 15
    if ($duplicate.status -ne 'passed' -or -not $duplicate.serviceAlreadyRunning) {
        throw [InvalidOperationException]::new('duplicate-client-boundary')
    }

    $stage = 'timeout-stop'
    Write-ServiceConfig 'result-timeout.json' 2
    Invoke-Sc @('start', $serviceName)
    [void](Wait-ServiceResult 'result-timeout.json' 'client-timeout' 15)
    Wait-ServiceState 'Stopped' 15
    $report.timeoutStop = $true

    $stage = 'crash-restart'
    Write-ServiceConfig 'result-crash.json' 30
    Invoke-Sc @('start', $serviceName)
    Wait-ServiceState 'Running' 10
    $crashService = Get-ProbeService
    if ($crashService.ProcessId -le 0 -or -not $crashService.PathName.Contains($destinationReader)) {
        throw [InvalidOperationException]::new('crash-process-identity')
    }
    Stop-Process -Id $crashService.ProcessId -Force
    Wait-ServiceState 'Stopped' 15
    $report.crashStopped = $true
    Write-ServiceConfig 'result-crash-restart.json' 30
    Write-State 'crash-restart-ready'
    $crashRestart = Wait-JsonFile 'client-crash-restart.json' 45
    [void](Wait-ServiceResult 'result-crash-restart.json' 'passed' 20)
    Wait-ServiceState 'Stopped' 15
    $report.crashRestarted = $crashRestart.status -eq 'passed' -and $crashRestart.serviceStartedByClient

    $stage = 'second-account-rejection'
    $temporaryUser = 'C7P23' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $temporaryPassword = 'C7!' + [Guid]::NewGuid().ToString('N') + 'z9'
    $securePassword = ConvertTo-SecureString $temporaryPassword -AsPlainText -Force
    $report.temporaryAccountRemoved = $false
    New-LocalUser -Name $temporaryUser -Password $securePassword -AccountNeverExpires `
        -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
    Write-ServiceConfig 'result-second-account.json' 30
    Invoke-Sc @('start', $serviceName)
    Wait-ServiceState 'Running' 10
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
using System.Threading;
public sealed class Cap7CEP23DeniedResult {
    public bool ServiceDenied { get; set; }
    public bool PipeDenied { get; set; }
}
public static class Cap7CEP23SecondAccount {
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern bool LogonUser(string user, string domain, string password, int type, int provider, out SafeAccessTokenHandle token);
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr OpenSCManager(string machine, string database, uint access);
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr OpenService(IntPtr manager, string name, uint access);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool CloseServiceHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);
    public static Cap7CEP23DeniedResult Check(string user, string password, string service, string pipe) {
        SafeAccessTokenHandle token;
        if (!LogonUser(user, ".", password, 2, 0, out token)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        using (token) {
            return WindowsIdentity.RunImpersonated(token, () => {
                var result = new Cap7CEP23DeniedResult();
                var manager = OpenSCManager(null, null, 1);
                if (manager == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                try {
                    var opened = OpenService(manager, service, 0x15);
                    var serviceError = Marshal.GetLastWin32Error();
                    if (opened != IntPtr.Zero) CloseServiceHandle(opened);
                    result.ServiceDenied = opened == IntPtr.Zero && serviceError == 5;
                } finally { CloseServiceHandle(manager); }
                for (var index = 0; index < 20; index++) {
                    var handle = CreateFile(@"\\.\pipe\" + pipe, 0x00120083, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
                    var pipeError = Marshal.GetLastWin32Error();
                    if (handle != new IntPtr(-1)) { CloseHandle(handle); result.PipeDenied = false; break; }
                    if (pipeError == 5) { result.PipeDenied = true; break; }
                    Thread.Sleep(50);
                }
                return result;
            });
        }
    }
}
'@
    $denied = [Cap7CEP23SecondAccount]::Check($temporaryUser, $temporaryPassword,
        $serviceName, 'cap7ce-ntfs-reader-p23-probe')
    $report.secondAccountServiceDenied = $denied.ServiceDenied
    $report.secondAccountPipeDenied = $denied.PipeDenied
    Invoke-Sc @('stop', $serviceName)
    Wait-ServiceState 'Stopped' 15
    Remove-LocalUser -Name $temporaryUser
    $temporaryUser = $null
    $report.temporaryAccountRemoved = $true
    if (-not ($report.secondAccountServiceDenied -and $report.secondAccountPipeDenied)) {
        throw [UnauthorizedAccessException]::new('second-account-not-denied')
    }

    $stage = 'upgrade-rollback'
    $candidatePath = Join-Path $programDir 'reader.new'
    $rollbackPath = Join-Path $programDir 'reader.rollback'
    $failedPath = Join-Path $programDir 'reader.failed'
    Copy-Item -LiteralPath $sourceReaderV2 -Destination $candidatePath
    if ((Get-Sha256 $candidatePath) -ne $ReaderV2Hash) { throw [InvalidOperationException]::new('candidate-hash') }
    Move-Item -LiteralPath $destinationReader -Destination $rollbackPath
    Move-Item -LiteralPath $candidatePath -Destination $destinationReader
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo($destinationReader).FileVersion -ne '2.0.0.0') {
        throw [InvalidOperationException]::new('candidate-version')
    }
    Write-State 'version-mismatch-ready'
    $versionMismatch = Wait-JsonFile 'client-version-mismatch.json' 45
    $serviceAfterMismatch = Get-ProbeService
    $report.versionMismatchRejectedBeforeStart = $versionMismatch.status -eq 'repair-required' -and
        $versionMismatch.reason -eq 'service-version-mismatch' -and
        $serviceAfterMismatch.State -eq 'Stopped'
    Move-Item -LiteralPath $destinationReader -Destination $failedPath
    Move-Item -LiteralPath $rollbackPath -Destination $destinationReader
    Remove-Item -LiteralPath $failedPath -Force
    $report.upgradeRollbackRestored = (Get-Sha256 $destinationReader) -eq $ReaderV1Hash -and
        [Diagnostics.FileVersionInfo]::GetVersionInfo($destinationReader).FileVersion -eq '1.0.0.0'
    Write-ServiceConfig 'result-rollback.json' 30
    Write-State 'rollback-ready'
    $rollback = Wait-JsonFile 'client-rollback.json' 45
    [void](Wait-ServiceResult 'result-rollback.json' 'passed' 20)
    Wait-ServiceState 'Stopped' 15
    $report.freshClientProcessRestarted = $rollback.status -eq 'passed' -and $rollback.serviceStartedByClient
    if (-not ($report.versionMismatchRejectedBeforeStart -and $report.upgradeRollbackRestored -and
        $report.freshClientProcessRestarted)) {
        throw [InvalidOperationException]::new('upgrade-rollback-failed')
    }

    if (-not ($report.idleStop -and $report.timeoutStop -and $report.duplicateStartRejected -and
        $report.crashStopped -and $report.crashRestarted)) {
        throw [InvalidOperationException]::new('service-lifecycle-failed')
    }
    $report.status = 'passed'
}
catch {
    $report.errorStage = $stage
    $report.errorType = $_.Exception.GetType().Name
    if ($_.Exception.Message -match '^[a-z0-9-]+$') { $report.errorCode = $_.Exception.Message }
}
finally {
    Write-State 'cleanup'
    if ($temporaryUser) {
        try { Remove-LocalUser -Name $temporaryUser -ErrorAction Stop; $report.temporaryAccountRemoved = $true }
        catch { $cleanupSafe = $false }
    }
    if ($serviceCreated) {
        try {
            $service = Get-ProbeService
            if ($null -ne $service -and -not $service.PathName.Contains($destinationReader)) {
                throw [InvalidOperationException]::new('service-cleanup-boundary')
            }
            if ($null -ne $service) {
                if ($service.State -ne 'Stopped') {
                    Invoke-Sc @('stop', $serviceName)
                    Wait-ServiceState 'Stopped' 15
                }
                Invoke-Sc @('delete', $serviceName)
                Wait-ServiceState 'Deleted' 15
            }
            $report.uninstallServiceRemoved = $true
        }
        catch { $cleanupSafe = $false }
    }
    if (Test-Path -LiteralPath $programDir) {
        try {
            $item = Get-Item -LiteralPath $programDir
            if ($item.FullName -ine $programDir -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw [InvalidOperationException]::new('program-cleanup-boundary')
            }
            $allowedProgram = @('Cap7CE.Core.Reader.Host.exe', 'Cap7CE.Core.Host.exe',
                'reader.new', 'reader.rollback', 'reader.failed', 'standard-write.tmp')
            $children = @(Get-ChildItem -LiteralPath $programDir -Force)
            if (@($children | Where-Object Name -NotIn $allowedProgram).Count -gt 0) {
                throw [InvalidOperationException]::new('program-cleanup-children')
            }
            foreach ($child in $children) {
                $hash = Get-Sha256 $child.FullName
                if ($child.Name -eq 'Cap7CE.Core.Host.exe') {
                    if ($hash -ne $ClientHash) { throw [InvalidOperationException]::new('client-cleanup-hash') }
                }
                elseif ($child.Name -ne 'standard-write.tmp' -and $hash -notin @($ReaderV1Hash, $ReaderV2Hash)) {
                    throw [InvalidOperationException]::new('reader-cleanup-hash')
                }
                Remove-Item -LiteralPath $child.FullName -Force
            }
            Remove-Item -LiteralPath $programDir -Force
            $report.uninstallProgramRemoved = $true
        }
        catch { $cleanupSafe = $false }
    }
    if (Test-Path -LiteralPath $dataDir) {
        try {
            $item = Get-Item -LiteralPath $dataDir
            $allowedData = @('config.json', 'result.pending.json', 'result-on-demand.json',
                'result-duplicate.json', 'result-timeout.json', 'result-crash.json',
                'result-crash-restart.json', 'result-second-account.json', 'result-rollback.json')
            $children = @(Get-ChildItem -LiteralPath $dataDir -Force)
            if ($item.FullName -ine $dataDir -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                @($children | Where-Object Name -NotIn $allowedData).Count -gt 0) {
                throw [InvalidOperationException]::new('data-cleanup-boundary')
            }
            foreach ($child in $children) { Remove-Item -LiteralPath $child.FullName -Force }
            Remove-Item -LiteralPath $dataDir -Force
            $report.uninstallConfigRemoved = $true
        }
        catch { $cleanupSafe = $false }
    }
    foreach ($path in @($dataReader, $dataCap7CE, $programReader, $programCap7CE)) {
        if ($createdDirectories.Contains($path) -and (Test-Path -LiteralPath $path)) {
            try {
                $item = Get-Item -LiteralPath $path
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                    @(Get-ChildItem -LiteralPath $path -Force).Count -ne 0) {
                    throw [InvalidOperationException]::new('parent-cleanup-boundary')
                }
                Remove-Item -LiteralPath $path -Force
            }
            catch { $cleanupSafe = $false }
        }
    }
    $report.cleanupOk = $cleanupSafe -and -not (Get-ProbeService) -and
        -not (Test-Path -LiteralPath $programDir) -and -not (Test-Path -LiteralPath $dataDir) -and
        $report.temporaryAccountRemoved
    [IO.File]::WriteAllText((Join-Path $ProbeRoot 'admin-report.json'),
        ($report | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
    Write-State 'complete'
}
