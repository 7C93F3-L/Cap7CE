param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$Label,
    [ValidateRange(3,60)][int]$Seconds = 10,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$phaseOwner = Get-Process -Id $ProcessId
$phaseStarted = $phaseOwner.StartTime
$phaseSamples = [Collections.Generic.List[object]]::new()
# Explicit, finite measurement only; this sampler is never started by the application.
for ($phaseStep = 0; $phaseStep -le $Seconds; $phaseStep++) {
    $phaseCurrentOwner = Get-Process -Id $ProcessId
    if ($phaseCurrentOwner.StartTime -ne $phaseStarted) { throw 'Measurement root process changed.' }
    $phaseProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
    $phaseIds = [Collections.Generic.HashSet[int]]::new()
    [void]$phaseIds.Add($ProcessId)
    do {
        $phaseAdded = $false
        foreach ($phaseProcess in $phaseProcesses) {
            if ($phaseIds.Contains([int]$phaseProcess.ParentProcessId) -and $phaseIds.Add([int]$phaseProcess.ProcessId)) { $phaseAdded = $true }
        }
    } while ($phaseAdded)
    $phaseLive = @($phaseIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    $phaseSamples.Add([pscustomobject]@{
        elapsedSeconds = $phaseStep
        count = $phaseLive.Count
        shellWorkingSetMiB = [math]::Round($phaseCurrentOwner.WorkingSet64 / 1MB, 2)
        treeWorkingSetMiB = [math]::Round(($phaseLive | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 2)
        treePrivateMiB = [math]::Round(($phaseLive | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 2)
        treeCpuSeconds = [math]::Round(($phaseLive | Measure-Object CPU -Sum).Sum, 3)
    })
    if ($phaseStep -lt $Seconds) { Start-Sleep -Milliseconds 1000 }
}
$phaseReport = [pscustomobject]@{
    label = $Label
    utc = [DateTime]::UtcNow.ToString('o')
    logicalProcessors = [Environment]::ProcessorCount
    os = [Environment]::OSVersion.VersionString
    note = 'Working sets include shared pages and are not unique physical memory. CPU totals may fall when workers exit. Compare matching workloads and cache states.'
    samples = $phaseSamples
}
$phaseJson = $phaseReport | ConvertTo-Json -Depth 5
if ($OutputPath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), $phaseJson) }
$phaseJson
