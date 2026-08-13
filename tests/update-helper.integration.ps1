$ErrorActionPreference = "Stop"
$probeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cap7ce-updater-probe-" + [guid]::NewGuid().ToString("N"))
$resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$resolvedProbe = [System.IO.Path]::GetFullPath($probeRoot)
$blockingProcess = $null
if (-not $resolvedProbe.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe updater probe path."
}

try {
  $installDirectory = Join-Path $probeRoot "installed\更新测试路径\Cap7CE"
  $payloadDirectory = Join-Path $probeRoot "payload\Cap7CE"
  $updateRoot = Join-Path $probeRoot "update"
  New-Item -ItemType Directory -Force -Path @(
    (Join-Path $installDirectory "models"),
    (Join-Path $installDirectory "llama.cpp"),
    (Join-Path $payloadDirectory "resources"),
    $updateRoot
  ) | Out-Null
  Set-Content -LiteralPath (Join-Path $installDirectory "current-marker.txt") -Value "old"
  Set-Content -LiteralPath (Join-Path $installDirectory "models\user-model.bin") -Value "preserve"
  Copy-Item -LiteralPath (Join-Path $env:WINDIR "System32\where.exe") -Destination (Join-Path $installDirectory "Cap7CE.exe")
  Copy-Item -LiteralPath (Join-Path $env:WINDIR "System32\where.exe") -Destination (Join-Path $payloadDirectory "Cap7CE.exe")
  Set-Content -LiteralPath (Join-Path $payloadDirectory "resources\app.asar") -Value "new"

  $packagePath = Join-Path $updateRoot "Cap7CE-9.9.9-win-x64.zip"
  Compress-Archive -LiteralPath $payloadDirectory -DestinationPath $packagePath
  $helperPath = (Resolve-Path (Join-Path $PSScriptRoot "..\build\update-helper.ps1")).Path
  $updater = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
    "-File", $helperPath,
    "-PackagePath", $packagePath,
    "-InstallDirectory", $installDirectory,
    "-ExpectedVersion", "9.9.9",
    "-CurrentProcessId", "999999",
    "-ExecutableName", "Cap7CE.exe",
    "-FailureCloseDelaySeconds", "0"
  ) -PassThru -Wait

  if ($updater.ExitCode -ne 1) {
    throw "Expected rollback exit code 1, got $($updater.ExitCode)."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "current-marker.txt") -PathType Leaf)) {
    throw "The previous application directory was not restored."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "models\user-model.bin") -PathType Leaf)) {
    throw "The preserved model directory was not restored."
  }

  Remove-Item -LiteralPath (Join-Path $probeRoot "payload") -Recurse -Force
  Remove-Item -LiteralPath $updateRoot -Recurse -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $payloadDirectory "resources"),$updateRoot | Out-Null
  Set-Content -LiteralPath (Join-Path $payloadDirectory "resources\app.asar") -Value "new"
  Set-Content -LiteralPath (Join-Path $payloadDirectory "updated-marker.txt") -Value "new"
  $fakeApplicationSource = @"
using System.Threading;
public static class Cap7CEUpdateProbeApplication {
  public static void Main() { Thread.Sleep(4000); }
}
"@
  Add-Type -TypeDefinition $fakeApplicationSource -OutputAssembly (Join-Path $payloadDirectory "Cap7CE.exe") -OutputType WindowsApplication
  Compress-Archive -LiteralPath $payloadDirectory -DestinationPath $packagePath
  $copiedHelperPath = Join-Path $updateRoot "update-helper.ps1"
  Copy-Item -LiteralPath $helperPath -Destination $copiedHelperPath
  $blockingProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoLogo", "-NoProfile", "-Command", "Start-Sleep -Seconds 30"
  ) -PassThru
  $successfulUpdater = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
    "-File", $copiedHelperPath,
    "-PackagePath", $packagePath,
    "-InstallDirectory", $installDirectory,
    "-ExpectedVersion", "9.9.9",
    "-CurrentProcessId", $blockingProcess.Id,
    "-ExecutableName", "Cap7CE.exe",
    "-StartupValidationSeconds", "1",
    "-FailureCloseDelaySeconds", "0"
  ) -PassThru
  $readyPath = Join-Path $updateRoot "helper-ready"
  $readyDeadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Path -LiteralPath $readyPath -PathType Leaf) -and (Get-Date) -lt $readyDeadline) {
    if ($successfulUpdater.HasExited) {
      throw "Updater exited before publishing its ready signal."
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not (Test-Path -LiteralPath $readyPath -PathType Leaf)) {
    throw "Updater did not publish its ready signal."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "current-marker.txt") -PathType Leaf)) {
    throw "The application directory was replaced before the current process exited."
  }
  Stop-Process -Id $blockingProcess.Id -Force
  $successfulUpdater.WaitForExit()
  if ($successfulUpdater.ExitCode -ne 0) {
    throw "Expected successful update exit code 0, got $($successfulUpdater.ExitCode)."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "updated-marker.txt") -PathType Leaf)) {
    throw "The updated application directory was not installed."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "models\user-model.bin") -PathType Leaf)) {
    throw "The model directory was not preserved after a successful update."
  }
  Start-Sleep -Seconds 4
  Write-Host '{"failedReplacementRolledBack":true,"successfulReplacementCompleted":true,"preservedDirectoriesRestored":true}'
} catch {
  Get-ChildItem -LiteralPath $probeRoot -Filter "update-helper.log" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host (Get-Content -LiteralPath $_.FullName -Raw)
  }
  throw
} finally {
  if ($blockingProcess -and -not $blockingProcess.HasExited) {
    Stop-Process -Id $blockingProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $probeRoot) {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force
  }
}
