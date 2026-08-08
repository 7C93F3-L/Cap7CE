import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const maximumOfficePreviewBytes = 256 * 1024 * 1024;
const officeConversionTimeoutMs = 30_000;
const officePreviewRoot = path.join(os.tmpdir(), "Cap7CE", "office-preview");

export type OfficePreviewKind = "excel" | "powerpoint";

type OfficeConversionRunner = (
  sourcePath: string,
  outputPath: string,
  kind: OfficePreviewKind,
  signal: AbortSignal
) => Promise<void>;

interface OfficePreviewSession {
  sessionId: string;
  sourcePath: string;
  directoryPath: string;
  outputPath: string;
  controller: AbortController;
  disposed: boolean;
}

const conversionScript = String.raw`
$ErrorActionPreference = "Stop"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Cap7CEOfficeProcess {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Publish-OfficeProcessId([object]$application) {
  [uint32]$processId = 0
  $windowHandle = [IntPtr]::new([int64]$application.Hwnd)
  [void][Cap7CEOfficeProcess]::GetWindowThreadProcessId($windowHandle, [ref]$processId)
  if ($processId -gt 0) {
    [Console]::Out.WriteLine("CAP7CE_OFFICE_PID=" + $processId)
    [Console]::Out.Flush()
  }
}

$application = $null
$document = $null
try {
  if ($env:CAP7CE_OFFICE_KIND -eq "excel") {
    $application = New-Object -ComObject Excel.Application
    $application.Visible = $false
    $application.DisplayAlerts = $false
    $application.EnableEvents = $false
    $application.AskToUpdateLinks = $false
    $application.AutomationSecurity = 3
    Publish-OfficeProcessId $application
    $document = $application.Workbooks.Open($env:CAP7CE_OFFICE_SOURCE, 0, $true)
    $document.ExportAsFixedFormat(0, $env:CAP7CE_OFFICE_OUTPUT)
  } elseif ($env:CAP7CE_OFFICE_KIND -eq "powerpoint") {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    Publish-OfficeProcessId $application
    $document = $application.Presentations.Open($env:CAP7CE_OFFICE_SOURCE, $true, $true, $false)
    $document.SaveAs($env:CAP7CE_OFFICE_OUTPUT, 32)
  } else {
    throw "Unsupported Office preview kind."
  }
} finally {
  if ($null -ne $document) {
    try { $document.Close($false) } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) } catch {}
  }
  if ($null -ne $application) {
    try { $application.Quit() } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

const encodedConversionScript = Buffer.from(conversionScript, "utf16le").toString("base64");

let activeSession: OfficePreviewSession | null = null;
let sessionRequestId = 0;
let conversionRunnerForTests: OfficeConversionRunner | null = null;

const createCancelledError = () => Object.assign(new Error("Office preview session was cancelled."), {
  code: "ECANCELED"
});

const getOfficePreviewKind = (filePath: string): OfficePreviewKind | null => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".xls" || extension === ".xlsx") return "excel";
  if (extension === ".ppt" || extension === ".pptx") return "powerpoint";
  return null;
};

const terminateOwnedOfficeProcess = (processId: number | null) => {
  if (!processId || !Number.isInteger(processId) || processId <= 0) return;
  try {
    process.kill(processId);
  } catch {
    // The Office process may already have exited normally.
  }
};

const runPowerShellConversion: OfficeConversionRunner = (sourcePath, outputPath, kind, signal) => (
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
        CAP7CE_OFFICE_SOURCE: sourcePath,
        CAP7CE_OFFICE_OUTPUT: outputPath,
        CAP7CE_OFFICE_KIND: kind
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let officeProcessId: number | null = null;
    let stdout = "";
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
      terminateOwnedOfficeProcess(officeProcessId);
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
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-4096);
      const match = /CAP7CE_OFFICE_PID=(\d+)/.exec(stdout);
      if (match) officeProcessId = Number(match[1]);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (signal.aborted) {
        finish(createCancelledError());
      } else if (code === 0) {
        finish();
      } else {
        finish(new Error(stderr.trim() || `Office preview conversion failed with code ${code}.`));
      }
    });
  })
);

const removeSessionDirectory = (directoryPath: string) => (
  fs.rm(directoryPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100
  }).catch(() => undefined)
);

const disposeSession = (session: OfficePreviewSession) => {
  if (session.disposed) return;
  session.disposed = true;
  session.controller.abort();
  void removeSessionDirectory(session.directoryPath);
};

export const prepareOfficePreviewTemporaryRoot = async () => {
  await fs.rm(officePreviewRoot, { recursive: true, force: true });
  await fs.mkdir(officePreviewRoot, { recursive: true });
};

export const closeOfficePreviewSession = (sessionId?: string) => {
  if (!activeSession || (sessionId && activeSession.sessionId !== sessionId)) return false;
  sessionRequestId += 1;
  const session = activeSession;
  activeSession = null;
  disposeSession(session);
  return true;
};

export const openOfficePreviewSession = async (sessionId: string, filePath: string) => {
  closeOfficePreviewSession();
  const requestId = ++sessionRequestId;
  const normalizedPath = path.normalize(path.resolve(filePath));
  if (!path.isAbsolute(filePath)) throw new Error("Office preview requires an absolute path.");
  const kind = getOfficePreviewKind(normalizedPath);
  if (!kind) throw new Error("Office preview format is unsupported.");
  const stat = await fs.stat(normalizedPath);
  if (!stat.isFile()) throw new Error("Office preview source is unavailable.");
  if (stat.size > maximumOfficePreviewBytes) {
    throw new Error(`Office preview file exceeds ${maximumOfficePreviewBytes} bytes.`);
  }
  if (requestId !== sessionRequestId) throw createCancelledError();

  await fs.mkdir(officePreviewRoot, { recursive: true });
  const directoryPath = await fs.mkdtemp(path.join(officePreviewRoot, "session-"));
  const outputPath = path.join(directoryPath, "preview.pdf");
  const session: OfficePreviewSession = {
    sessionId,
    sourcePath: normalizedPath,
    directoryPath,
    outputPath,
    controller: new AbortController(),
    disposed: false
  };
  activeSession = session;

  try {
    const runner = conversionRunnerForTests ?? runPowerShellConversion;
    await runner(normalizedPath, outputPath, kind, session.controller.signal);
    if (requestId !== sessionRequestId || session.disposed || activeSession !== session) {
      throw createCancelledError();
    }
    const output = await fs.readFile(outputPath);
    if (output.length < 5 || output.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Office preview conversion did not produce a PDF.");
    }
    return { pdfPath: outputPath, kind };
  } catch (error) {
    if (activeSession === session) activeSession = null;
    disposeSession(session);
    throw error;
  }
};

export const setOfficePreviewConversionRunnerForTests = (runner: OfficeConversionRunner | null) => {
  closeOfficePreviewSession();
  conversionRunnerForTests = runner;
};
