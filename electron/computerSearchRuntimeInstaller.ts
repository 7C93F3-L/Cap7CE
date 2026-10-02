import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ComputerSearchRuntimeInstallState } from "./computerSearchTypes";

const maximumRuntimeInstallerBytes = 128 * 1024 * 1024;

interface RuntimeInstallerOptions {
  rootDirectory: string;
  installerUrl: string;
  installerSha512: string;
  detectRuntime: () => Promise<boolean>;
  fetchDownload?: typeof fetch;
  runInstaller?: (installerPath: string) => Promise<number>;
}

const hashFile = async (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash("sha512");
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.once("error", reject);
  stream.once("end", () => resolve(hash.digest("hex")));
});

export class ComputerSearchRuntimeInstaller {
  private state: ComputerSearchRuntimeInstallState = { phase: "idle", receivedBytes: 0, totalBytes: null };
  constructor(private readonly options: RuntimeInstallerOptions) {}

  getState(): ComputerSearchRuntimeInstallState { return { ...this.state }; }

  async install(): Promise<"ready" | "restart-required" | "failed"> {
    if (await this.options.detectRuntime()) {
      this.state = { phase: "ready", receivedBytes: 0, totalBytes: null };
      return "ready";
    }
    const installerPath = path.join(this.options.rootDirectory, "dotnet-runtime-10.0.12-win-x64.exe");
    const partialPath = `${installerPath}.part`;
    try {
      await fs.mkdir(this.options.rootDirectory, { recursive: true });
      await Promise.all([fs.rm(installerPath, { force: true }), fs.rm(partialPath, { force: true })]);
      const response = await (this.options.fetchDownload ?? fetch)(this.options.installerUrl, {
        method: "GET", redirect: "follow", headers: { "User-Agent": "Cap7CE/CoreCapability" }
      });
      if (!response.ok || !response.body) throw new Error("runtime-download-failed");
      const contentLength = Number(response.headers.get("content-length"));
      const totalBytes = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : null;
      if (totalBytes !== null && totalBytes > maximumRuntimeInstallerBytes) throw new Error("runtime-installer-too-large");
      this.state = { phase: "downloading", receivedBytes: 0, totalBytes };
      const handle = await fs.open(partialPath, "wx");
      const reader = response.body.getReader();
      let receivedBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          receivedBytes += value.byteLength;
          if (receivedBytes > maximumRuntimeInstallerBytes
              || (totalBytes !== null && receivedBytes > totalBytes)) throw new Error("runtime-installer-too-large");
          await handle.write(value);
          this.state = { phase: "downloading", receivedBytes, totalBytes };
        }
        await handle.sync();
      } finally { await handle.close(); }
      if (totalBytes !== null && receivedBytes !== totalBytes) throw new Error("runtime-download-incomplete");
      this.state = { phase: "verifying", receivedBytes, totalBytes };
      if (await hashFile(partialPath) !== this.options.installerSha512) throw new Error("runtime-digest-mismatch");
      await fs.rename(partialPath, installerPath);
      this.state = { phase: "installing", receivedBytes, totalBytes };
      const runInstaller = this.options.runInstaller ?? (async (targetPath: string) => {
        const { spawn } = await import("node:child_process");
        return new Promise<number>((resolve) => {
          const child = spawn(targetPath, ["/install", "/norestart"], {
            shell: false, windowsHide: false, stdio: "ignore"
          });
          child.once("error", () => resolve(-1));
          child.once("exit", (code) => resolve(code ?? -1));
        });
      });
      const exitCode = await runInstaller(installerPath);
      await fs.rm(installerPath, { force: true }).catch(() => undefined);
      if (exitCode === 3010) {
        this.state = { phase: "restart-required", receivedBytes, totalBytes };
        return "restart-required";
      }
      if (exitCode === 0 && await this.options.detectRuntime()) {
        this.state = { phase: "ready", receivedBytes, totalBytes };
        return "ready";
      }
      if (exitCode === 0) {
        this.state = { phase: "restart-required", receivedBytes, totalBytes };
        return "restart-required";
      }
      throw new Error("runtime-installer-failed");
    } catch {
      await Promise.all([fs.rm(installerPath, { force: true }).catch(() => undefined),
        fs.rm(partialPath, { force: true }).catch(() => undefined)]);
      this.state = { phase: "failed", receivedBytes: 0, totalBytes: null };
      return "failed";
    }
  }
}
