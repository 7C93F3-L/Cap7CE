param(
  [Parameter(Mandatory = $true)][string]$PackagePath,
  [Parameter(Mandatory = $true)][string]$InstallDirectory,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [Parameter(Mandatory = $true)][int]$CurrentProcessId,
  [Parameter(Mandatory = $true)][string]$ExecutableName,
  [ValidateRange(1, 30)][int]$StartupValidationSeconds = 6,
  [ValidateRange(0, 60)][int]$FailureCloseDelaySeconds = 15
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"
$updateRoot = Split-Path -Parent $PackagePath
$extractDirectory = Join-Path $updateRoot "extracted"
$sourceDirectory = Join-Path $extractDirectory "Cap7CE"
$readyPath = Join-Path $updateRoot "helper-ready"
$logPath = Join-Path $updateRoot "update-helper.log"
$installDirectoryPath = [System.IO.Path]::GetFullPath($InstallDirectory).TrimEnd("\")
$installParent = Split-Path -Parent $installDirectoryPath
$backupDirectory = Join-Path $installParent (".Cap7CE-backup-" + [guid]::NewGuid().ToString("N"))
$replacementStarted = $false
$currentProcessExited = $false

function Write-UpdateLog([string]$Message) {
  Add-Content -LiteralPath $logPath -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $Message) -Encoding UTF8
}

function Write-UpdateStatus([string]$Message) {
  Write-Host ""
  Write-Host ("[Cap7CE Update] " + $Message) -ForegroundColor Cyan
  Write-UpdateLog $Message
}

function Start-Cap7CE([string]$RootDirectory) {
  $executablePath = Join-Path $RootDirectory $ExecutableName
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Cap7CE executable is missing after update."
  }
  return Start-Process -FilePath $executablePath -WorkingDirectory $RootDirectory -PassThru
}

try {
  if (Test-Path -LiteralPath $readyPath) {
    Remove-Item -LiteralPath $readyPath -Force
  }
  Write-UpdateLog ("Updater started for Cap7CE " + $ExpectedVersion + ".")
  $installRoot = [System.IO.Path]::GetPathRoot($installDirectoryPath).TrimEnd("\")
  if (-not $installParent -or $installRoot -eq $installDirectoryPath) {
    throw "The application directory is not safe to replace."
  }
  if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    throw "The downloaded update package is missing."
  }

  Write-UpdateStatus "Extracting Cap7CE $ExpectedVersion..."
  if (Test-Path -LiteralPath $extractDirectory) {
    Remove-Item -LiteralPath $extractDirectory -Recurse -Force
  }
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $extractDirectory -Force

  Write-UpdateStatus "Validating the extracted package..."
  $sourceExecutable = Join-Path $sourceDirectory $ExecutableName
  $sourceAsar = Join-Path $sourceDirectory "resources\app.asar"
  if (-not (Test-Path -LiteralPath $sourceExecutable -PathType Leaf) -or -not (Test-Path -LiteralPath $sourceAsar -PathType Leaf)) {
    throw "The update package does not contain the expected Cap7CE layout."
  }

  Set-Content -LiteralPath $readyPath -Value $ExpectedVersion -Encoding ASCII
  Write-UpdateStatus "Waiting for Cap7CE to exit..."
  Wait-Process -Id $CurrentProcessId -ErrorAction SilentlyContinue
  $currentProcessExited = $true

  Write-UpdateStatus "Backing up the current version..."
  Move-Item -LiteralPath $installDirectoryPath -Destination $backupDirectory
  $replacementStarted = $true

  Write-UpdateStatus "Installing Cap7CE $ExpectedVersion..."
  Copy-Item -LiteralPath $sourceDirectory -Destination $installDirectoryPath -Recurse

  foreach ($preservedDirectoryName in @("llama.cpp", "models")) {
    $preservedDirectory = Join-Path $backupDirectory $preservedDirectoryName
    if (-not (Test-Path -LiteralPath $preservedDirectory -PathType Container)) {
      continue
    }
    $newDirectory = Join-Path $installDirectoryPath $preservedDirectoryName
    if (Test-Path -LiteralPath $newDirectory) {
      Remove-Item -LiteralPath $newDirectory -Recurse -Force
    }
    Copy-Item -LiteralPath $preservedDirectory -Destination $newDirectory -Recurse
  }

  Write-UpdateStatus "Starting the updated application..."
  $newProcess = Start-Cap7CE $installDirectoryPath
  Start-Sleep -Seconds $StartupValidationSeconds
  if ($newProcess.HasExited) {
    throw "The updated application exited before startup completed."
  }

  $replacementStarted = $false
  Write-UpdateStatus "Update completed. Cleaning temporary files..."
  try {
    Remove-Item -LiteralPath $backupDirectory -Recurse -Force
  } catch {
    Write-Host "[Cap7CE Update] The previous-version backup could not be removed automatically." -ForegroundColor Yellow
  }
  try {
    Set-Location ([System.IO.Path]::GetTempPath())
    Remove-Item -LiteralPath $updateRoot -Recurse -Force
  } catch {
    Write-Host "[Cap7CE Update] Some temporary files could not be removed automatically." -ForegroundColor Yellow
  }
  exit 0
} catch {
  Write-UpdateLog ("Update failed: " + $_.Exception.Message)
  Write-Host ""
  Write-Host ("[Cap7CE Update] Update failed: " + $_.Exception.Message) -ForegroundColor Red
  if ($replacementStarted -and (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
    Write-Host "[Cap7CE Update] Restoring the previous version..." -ForegroundColor Yellow
    if (Test-Path -LiteralPath $installDirectoryPath) {
      Remove-Item -LiteralPath $installDirectoryPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $backupDirectory -Destination $installDirectoryPath
  }
  if ($currentProcessExited -and (Test-Path -LiteralPath (Join-Path $installDirectoryPath $ExecutableName) -PathType Leaf)) {
    Start-Cap7CE $installDirectoryPath | Out-Null
  }
  Write-Host ("[Cap7CE Update] The previous version has been restored. This window will close in " + $FailureCloseDelaySeconds + " seconds.") -ForegroundColor Yellow
  if ($FailureCloseDelaySeconds -gt 0) {
    Start-Sleep -Seconds $FailureCloseDelaySeconds
  }
  exit 1
}
