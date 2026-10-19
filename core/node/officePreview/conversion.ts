import { officeJobSource } from "./officeJob";
import { spawnPreviewWorker as spawn } from "../providerPreview/lifecycle";
import type { OfficePreviewKind } from "../../../src/shared/officePreviewTypes";
export type OfficeConversionRunner = (
  sourcePath: string,
  outputPath: string,
  kind: OfficePreviewKind,
  signal: AbortSignal
) => Promise<void>;

const officeConversionTimeoutMs = 30_000;
export const conversionScript = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
${officeJobSource}
"@
function Get-OfficeProcessId([object]$application) {
  [uint32]$officeProcessId = 0
  [void][Cap7CEOfficeProcess]::GetWindowThreadProcessId([IntPtr]::new([int64]$application.Hwnd), [ref]$officeProcessId)
  return $officeProcessId
}
$application = $null
$document = $null
$ownsApplication = $false
$officeJob = New-Object Cap7CEOfficeProcess
try {
  [uint32[]]$existingProcesses = @(Get-Process | ForEach-Object { [uint32]$_.Id })
  if ($env:CAP7CE_OFFICE_KIND -eq "excel") { $application = New-Object -ComObject Excel.Application }
  elseif ($env:CAP7CE_OFFICE_KIND -eq "powerpoint") { $application = New-Object -ComObject PowerPoint.Application }
  else { throw "Unsupported Office preview kind." }
  [uint32]$officeProcessId = Get-OfficeProcessId $application
  $hasDocuments = if ($env:CAP7CE_OFFICE_KIND -eq "excel") { $application.Workbooks.Count -gt 0 } else { $application.Presentations.Count -gt 0 }
  if ([Cap7CEOfficeProcess]::IsExisting($officeProcessId, $existingProcesses) -or $hasDocuments) { throw "CAP7CE_OFFICE_EXISTING_INSTANCE" }
  $ownsApplication = $true
  $officeJob.Attach($officeProcessId)
  $application.AutomationSecurity = 3
  if ($env:CAP7CE_OFFICE_KIND -eq "excel") {
    $application.Visible = $false
    $application.DisplayAlerts = $false
    $application.EnableEvents = $false
    $application.AskToUpdateLinks = $false
    $document = $application.Workbooks.Open($env:CAP7CE_OFFICE_SOURCE, 0, $true)
    $document.ExportAsFixedFormat(0, $env:CAP7CE_OFFICE_OUTPUT)
  } else {
    $application.DisplayAlerts = 1
    $document = $application.Presentations.Open($env:CAP7CE_OFFICE_SOURCE, $true, $true, $false)
    $document.SaveAs($env:CAP7CE_OFFICE_OUTPUT, 32)
  }
} finally {
  if ($null -ne $document) {
    try { if ($env:CAP7CE_OFFICE_KIND -eq "excel") { $document.Close($false) } else { $document.Close() } } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) } catch {}
  }
  if ($null -ne $application) {
    if ($ownsApplication) { try { $application.Quit() } catch {} }
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) } catch {}
  }
  $officeJob.Dispose()
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

const encodedConversionScript = Buffer.from(conversionScript, "utf16le").toString("base64");

export const createCancelledError = () => Object.assign(new Error("Office preview session was cancelled."), {
  code: "ECANCELED"
});

export const runPowerShellConversion: OfficeConversionRunner = (sourcePath, outputPath, kind, signal) => (
  new Promise<void>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Office preview requires Windows."));
      return;
    }
    if (signal.aborted) {
      reject(createCancelledError());
      return;
    }

    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedConversionScript
    ], {
      env: {
        ...process.env,
        ...(process.env.CAP7CE_CORE_SCRATCH_ROOT ? { TEMP: process.env.CAP7CE_CORE_SCRATCH_ROOT, TMP: process.env.CAP7CE_CORE_SCRATCH_ROOT } : {}),
        CAP7CE_OFFICE_SOURCE: sourcePath,
        CAP7CE_OFFICE_OUTPUT: outputPath,
        CAP7CE_OFFICE_KIND: kind
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      if (error) reject(error);
      else resolve();
    };
    const terminateOwnedProcesses = () => {
      child.kill();
    };
    const handleAbort = () => {
      terminateOwnedProcesses();
      finish(createCancelledError());
    };
    const timeout = setTimeout(() => {
      terminateOwnedProcesses();
      finish(Object.assign(new Error("Office preview conversion timed out."), { code: "ETIMEDOUT" }));
    }, officeConversionTimeoutMs);

    signal.addEventListener("abort", handleAbort, { once: true });
    child.stdout!.resume();
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (signal.aborted) {
        finish(createCancelledError());
      } else if (code === 0) {
        finish();
      } else {
        finish(Object.assign(new Error(stderr.trim() || `Office preview conversion failed with code ${code}.`), stderr.includes("CAP7CE_OFFICE_EXISTING_INSTANCE") ? { code: "EOFFICEINUSE" } : {}));
      }
    });
  })
);
