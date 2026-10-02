import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ComputerSearchCapabilityOptions, ComputerSearchCapabilityRequest,
  ComputerSearchCapabilityResult, ComputerSearchCapabilityVolume,
  ComputerSearchRuntimeInstallState
} from "./computerSearchTypes";
import { ComputerSearchRuntimeInstaller } from "./computerSearchRuntimeInstaller";

const execFileAsync = promisify(execFile);
const minimumRuntime = [10, 0, 12] as const;
const runtimeInstallerUrl = "https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-win-x64.exe";
const runtimeInstallerSha512 = "b937ae539c4ab21f885b033178dadea98018baad777252c76251e760d81c18463b2f802e86b6a67ea066690e9ede2d66a6bc3c3e614e391505e98c4c41121400";
const volumeDiscoveryCommand = [
  "$ErrorActionPreference='Stop';",
  "Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' -and $_.FileSystemType -eq 'NTFS' }",
  "| Select-Object DriveLetter,FileSystemLabel,Size,SizeRemaining | ConvertTo-Json -Compress"
].join(" ");

const compareVersion = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export const hasRequiredCoreRuntime = (versions: string[]): boolean => versions.some((version) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return Boolean(match && compareVersion(match.slice(1).map(Number), minimumRuntime) >= 0);
});

export const parseFixedNtfsVolumes = (output: string): ComputerSearchCapabilityVolume[] => {
  let parsed: unknown;
  try { parsed = JSON.parse(output.replace(/^\uFEFF/, "").trim() || "[]"); } catch { return []; }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const seen = new Set<string>();
  const volumes: ComputerSearchCapabilityVolume[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const driveLetter = typeof record.DriveLetter === "string" ? record.DriveLetter.toUpperCase() : "";
    if (!/^[A-Z]$/.test(driveLetter) || seen.has(driveLetter)) continue;
    const sizeBytes = typeof record.Size === "number" && Number.isSafeInteger(record.Size) ? record.Size : null;
    const freeBytes = typeof record.SizeRemaining === "number" && Number.isSafeInteger(record.SizeRemaining)
      ? record.SizeRemaining : null;
    seen.add(driveLetter);
    volumes.push({ driveLetter, label: typeof record.FileSystemLabel === "string" ? record.FileSystemLabel : "",
      sizeBytes, freeBytes });
  }
  return volumes.sort((left, right) => left.driveLetter.localeCompare(right.driveLetter));
};

export const buildCapabilitySetupArguments = (request: ComputerSearchCapabilityRequest): string[] => {
  const args = ["--activation-coordinator", "--action", request.action,
    "--catalog", request.removeCatalog ? "remove" : "preserve"];
  if (request.action !== "remove" && request.volumeLetters.length > 0) {
    args.push("--volumes", request.volumeLetters.join(","));
  }
  return args;
};

interface RuntimeInstallerService {
  getState: () => ComputerSearchRuntimeInstallState;
  install: () => Promise<"ready" | "restart-required" | "failed">;
}

interface CapabilityControllerOptions {
  packaged: boolean;
  resourcesPath: string;
  programFilesPath?: string;
  developmentBundleRoot?: string;
  localAppDataPath?: string;
  discoverVolumes?: () => Promise<ComputerSearchCapabilityVolume[]>;
  detectRuntime?: () => Promise<boolean>;
  runtimeInstaller?: RuntimeInstallerService;
  runSetup?: (setupPath: string, args: string[]) => Promise<{ exitCode: number; output: string }>;
}

const readFailureReason = (output: string) => {
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (typeof value.reason === "string" && /^[a-z0-9-]{1,96}$/.test(value.reason)) return value.reason;
    } catch { /* Setup output is intentionally reduced to fixed JSON envelopes. */ }
  }
  return "capability-setup-failed";
};

export class ComputerSearchCapabilityController {
  private busy = false;
  private readonly runtimeInstaller: RuntimeInstallerService;
  constructor(private readonly options: CapabilityControllerOptions) {
    const localAppData = options.localAppDataPath ?? process.env.LOCALAPPDATA ?? process.cwd();
    this.runtimeInstaller = options.runtimeInstaller ?? new ComputerSearchRuntimeInstaller({
      rootDirectory: path.join(localAppData, "Cap7CE", "installers", "dotnet"),
      installerUrl: runtimeInstallerUrl, installerSha512: runtimeInstallerSha512,
      detectRuntime: () => this.runtimeReady()
    });
  }

  private get setupPath() {
    const root = this.options.packaged
      ? path.join(this.options.resourcesPath, "core-capability", "v1")
      : this.options.developmentBundleRoot ?? path.resolve(
        __dirname, "../core/artifacts/product-capability/v1/bundle");
    return path.join(root, "Cap7CE.Core.Setup.exe");
  }

  private async bundleAvailable() {
    try { return (await fs.stat(this.setupPath)).isFile(); } catch { return false; }
  }

  private async runtimeReady() {
    if (this.options.detectRuntime) return this.options.detectRuntime();
    const programFiles = this.options.programFilesPath ?? process.env.ProgramFiles ?? "C:\\Program Files";
    const runtimeRoot = path.join(programFiles, "dotnet", "shared", "Microsoft.NETCore.App");
    try { return hasRequiredCoreRuntime(await fs.readdir(runtimeRoot)); } catch { return false; }
  }

  private async volumes() {
    if (this.options.discoverVolumes) return this.options.discoverVolumes();
    if (process.platform !== "win32") return [];
    const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows",
      "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    try {
      const { stdout } = await execFileAsync(powershell,
        ["-NoProfile", "-NonInteractive", "-Command", volumeDiscoveryCommand],
        { encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 });
      return parseFixedNtfsVolumes(stdout);
    } catch { return []; }
  }

  async status(): Promise<ComputerSearchCapabilityOptions> {
    const [bundleAvailable, runtimeReady, volumes] = await Promise.all([
      this.bundleAvailable(), this.runtimeReady(), this.volumes()
    ]);
    return { bundleAvailable, runtimeReady, busy: this.busy, volumes,
      runtimeInstall: this.runtimeInstaller.getState() };
  }

  async configure(request: ComputerSearchCapabilityRequest): Promise<ComputerSearchCapabilityResult> {
    if (this.busy) return { status: "busy", reason: "capability-operation-active" };
    if (!await this.bundleAvailable()) return { status: "unavailable", reason: "capability-bundle-missing" };
    this.busy = true;
    try {
      if (request.action !== "remove" && !await this.runtimeReady()) {
        const runtime = await this.runtimeInstaller.install();
        if (runtime === "restart-required") return { status: "restart-required", reason: "runtime-restart-required" };
        if (runtime !== "ready") return { status: "failed", reason: "runtime-install-failed" };
      }
      const runner = this.options.runSetup ?? ((setupPath: string, args: string[]) => new Promise((resolve) => {
        const child = spawn(setupPath, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const append = (chunk: Buffer) => { if (output.length < 65_536) output += chunk.toString("utf8"); };
        child.stdout?.on("data", append); child.stderr?.on("data", append);
        child.once("error", () => resolve({ exitCode: -1, output }));
        child.once("exit", (code) => resolve({ exitCode: code ?? -1, output }));
      }));
      const result = await runner(this.setupPath, buildCapabilitySetupArguments(request));
      return result.exitCode === 0
        ? { status: "completed", reason: request.action === "remove" ? "capability-removed" : "capability-ready" }
        : { status: "failed", reason: readFailureReason(result.output) };
    } finally { this.busy = false; }
  }
}
