import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppUpdateDownloadErrorCode, AppUpdateDownloadProgress, AppUpdatePublicState } from "./appUpdateTypes";
import {
  compareAppVersions,
  isValidAppUpdateAsset,
  maximumUpdateInstallerBytes,
  type AppUpdateAsset
} from "./appUpdateService";

export class AppUpdateDownloadError extends Error {
  constructor(public readonly code: AppUpdateDownloadErrorCode, message: string) {
    super(message);
    this.name = "AppUpdateDownloadError";
  }
}

interface AppUpdateMetadata {
  schemaVersion: 1;
  status: "partial" | "ready";
  asset: AppUpdateAsset;
  receivedBytes: number;
  etag: string | null;
  lastModified: string | null;
}

interface AppUpdateDiagnostics {
  log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void;
}

export interface AppUpdateDownloadServiceOptions {
  rootDirectory: string;
  currentVersion: string;
  fetchDownload?: typeof fetch;
  openInstaller: (installerPath: string) => Promise<string>;
  onInstallerOpened?: (version: string) => Promise<void>;
  onProgress: (progress: AppUpdateDownloadProgress) => void;
  diagnostics: AppUpdateDiagnostics;
  inactivityTimeoutMs?: number;
  getAvailableDiskBytes?: (targetPath: string) => Promise<number | null>;
}

const metadataFileName = "update.json";
const defaultDownloadInactivityTimeoutMs = 60_000;

export const resolveAppUpdateRootDirectory = (localAppData: string | undefined, userDataPath: string): string => (
  localAppData && path.isAbsolute(localAppData)
    ? path.join(localAppData, "Cap7CE", "updates")
    : path.join(userDataPath, "updates")
);

const safeLog = (diagnostics: AppUpdateDiagnostics, level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) => {
  try { diagnostics.log(level, event, data); } catch { /* Diagnostics cannot break updates. */ }
};

const installerNameFor = (version: string) => `Cap7CE-Setup-${version}-x64.exe`;
const percentFor = (receivedBytes: number, totalBytes: number) => Math.min(100, Math.round((receivedBytes / totalBytes) * 100));

const hashFile = async (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.once("error", reject);
  stream.once("end", () => resolve(hash.digest("hex")));
});

const defaultGetAvailableDiskBytes = async (targetPath: string): Promise<number | null> => {
  try {
    const stats = await fs.statfs(targetPath);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
};

const isSameAsset = (left: AppUpdateAsset, right: AppUpdateAsset) => (
  left.assetId === right.assetId
  && left.version === right.version
  && left.assetName === right.assetName
  && left.tagName === right.tagName
  && left.uploadState === right.uploadState
  && left.size === right.size
  && left.digest === right.digest
  && left.downloadUrl === right.downloadUrl
);

const parseMetadata = (value: unknown): AppUpdateMetadata | null => {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Partial<AppUpdateMetadata>;
  if (metadata.schemaVersion !== 1
    || (metadata.status !== "partial" && metadata.status !== "ready")
    || !metadata.asset
    || !isValidAppUpdateAsset(metadata.asset)
    || !Number.isSafeInteger(metadata.receivedBytes)
    || (metadata.receivedBytes as number) < 0
    || (metadata.receivedBytes as number) > metadata.asset.size
    || (metadata.etag !== null && typeof metadata.etag !== "string")
    || (metadata.lastModified !== null && typeof metadata.lastModified !== "string")
  ) return null;
  return metadata as AppUpdateMetadata;
};

const parseContentRange = (value: string | null) => {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
};

export class AppUpdateDownloadService {
  private readonly metadataPath: string;
  private readonly fetchDownload: typeof fetch;
  private readonly inactivityTimeoutMs: number;
  private readonly getAvailableDiskBytes: (targetPath: string) => Promise<number | null>;
  private asset: AppUpdateAsset | null = null;
  private metadata: AppUpdateMetadata | null = null;
  private abortController: AbortController | null = null;
  private phase: AppUpdatePublicState["status"] = "idle";

  constructor(private readonly options: AppUpdateDownloadServiceOptions) {
    this.metadataPath = path.join(options.rootDirectory, metadataFileName);
    this.fetchDownload = options.fetchDownload ?? fetch;
    this.inactivityTimeoutMs = options.inactivityTimeoutMs ?? defaultDownloadInactivityTimeoutMs;
    this.getAvailableDiskBytes = options.getAvailableDiskBytes ?? defaultGetAvailableDiskBytes;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.options.rootDirectory, { recursive: true });
    const metadata = await this.readMetadata();
    if (!metadata || compareAppVersions(metadata.asset.version, this.options.currentVersion) <= 0) {
      if (metadata) await this.removeAssetFiles(metadata.asset);
      else await this.removeAllRecognizedUpdateFiles();
      await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
      await this.removeObsoleteInstallers();
      return;
    }

    this.asset = metadata.asset;
    this.metadata = metadata;
    const partialPath = this.partialPath(metadata.asset);
    const finalPath = this.finalPath(metadata.asset);
    if (metadata.status === "ready") {
      if (await this.verifyInstaller(finalPath, metadata.asset)) {
        this.phase = "ready";
      } else {
        await this.removeAssetFiles(metadata.asset);
        await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
        this.clearMemoryState();
      }
    } else {
      const partialSize = await this.fileSize(partialPath);
      if (partialSize === null || partialSize > metadata.asset.size) {
        await this.removeAssetFiles(metadata.asset);
        await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
        this.clearMemoryState();
      } else {
        this.metadata.receivedBytes = partialSize;
        await this.writeMetadata(this.metadata);
        this.phase = partialSize > 0 ? "resumable" : "idle";
      }
    }
    await this.removeObsoleteInstallers();
  }

  async setAvailableAsset(asset: AppUpdateAsset | null): Promise<void> {
    if (!asset || compareAppVersions(asset.version, this.options.currentVersion) <= 0) {
      if (this.asset) await this.discard();
      return;
    }
    if (!isValidAppUpdateAsset(asset)) throw new AppUpdateDownloadError("invalid", "Update asset metadata is invalid");
    if (this.asset && !isSameAsset(this.asset, asset)) await this.discard();
    this.asset = asset;
    if (this.metadata && !isSameAsset(this.metadata.asset, asset)) this.metadata = null;
  }

  getState(): AppUpdatePublicState {
    if (!this.asset) return { status: "idle" };
    const receivedBytes = this.metadata?.receivedBytes ?? 0;
    return {
      status: this.phase,
      version: this.asset.version,
      receivedBytes,
      totalBytes: this.asset.size,
      percent: percentFor(receivedBytes, this.asset.size)
    };
  }

  isBusy(): boolean {
    return this.abortController !== null;
  }

  pause(): boolean {
    if (!this.abortController) return false;
    this.abortController.abort();
    return true;
  }

  async discard(): Promise<void> {
    if (this.abortController) throw new AppUpdateDownloadError("invalid", "Cannot discard an active update download");
    if (this.asset) await this.removeAssetFiles(this.asset);
    await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
    this.clearMemoryState();
  }

  async download(): Promise<AppUpdatePublicState> {
    if (!this.asset) throw new AppUpdateDownloadError("invalid", "No trusted update asset is available");
    if (this.abortController) return this.getState();
    if (this.metadata?.status === "ready" && await this.verifyInstaller(this.finalPath(this.asset), this.asset)) {
      this.phase = "ready";
      return this.getState();
    }

    this.abortController = new AbortController();
    this.phase = "downloading";
    const asset = this.asset;
    try {
      await this.downloadAsset(asset, this.abortController.signal);
      this.phase = "ready";
      safeLog(this.options.diagnostics, "info", "app_update.download_ready", { version: asset.version, assetId: asset.assetId });
      return this.getState();
    } catch (error) {
      const normalized = this.normalizeError(error, this.abortController.signal.aborted);
      const partialSize = await this.fileSize(this.partialPath(asset));
      if (partialSize !== null && partialSize <= asset.size) {
        this.metadata = {
          schemaVersion: 1,
          status: "partial",
          asset,
          receivedBytes: partialSize,
          etag: this.metadata?.etag ?? null,
          lastModified: this.metadata?.lastModified ?? null
        };
        await this.writeMetadata(this.metadata).catch(() => undefined);
        this.phase = partialSize > 0 ? "resumable" : "idle";
      } else {
        this.phase = "idle";
      }
      safeLog(this.options.diagnostics, normalized.code === "cancelled" ? "info" : "warn", "app_update.download_interrupted", {
        version: asset.version,
        assetId: asset.assetId,
        reason: normalized.code,
        receivedBytes: partialSize ?? 0
      });
      throw normalized;
    } finally {
      this.abortController = null;
    }
  }

  async openReadyInstaller(): Promise<{ status: "installing" | "failed"; version?: string; reason?: AppUpdateDownloadErrorCode }> {
    const asset = this.asset;
    if (!asset || this.metadata?.status !== "ready") return { status: "failed", reason: "invalid" };
    const installerPath = this.finalPath(asset);
    if (!await this.verifyInstaller(installerPath, asset)) {
      await this.removeAssetFiles(asset);
      await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
      this.clearMemoryState();
      return { status: "failed", version: asset.version, reason: "invalid" };
    }
    const openError = await this.options.openInstaller(installerPath);
    if (openError) {
      safeLog(this.options.diagnostics, "error", "app_update.installer_open_failed", { version: asset.version, assetId: asset.assetId, error: openError });
      return { status: "failed", version: asset.version, reason: "unknown" };
    }
    if (this.options.onInstallerOpened) {
      await this.options.onInstallerOpened(asset.version).catch((error) => {
        safeLog(this.options.diagnostics, "warn", "app_update.install_intent_write_failed", { version: asset.version, assetId: asset.assetId, error });
      });
    }
    safeLog(this.options.diagnostics, "info", "app_update.installer_opened", { version: asset.version, assetId: asset.assetId });
    return { status: "installing", version: asset.version };
  }

  private async downloadAsset(asset: AppUpdateAsset, signal: AbortSignal): Promise<void> {
    await fs.mkdir(this.options.rootDirectory, { recursive: true });
    const partialPath = this.partialPath(asset);
    const finalPath = this.finalPath(asset);
    await fs.rm(finalPath, { force: true }).catch(() => undefined);
    let offset = await this.fileSize(partialPath) ?? 0;
    if (offset > asset.size) {
      await fs.rm(partialPath, { force: true });
      offset = 0;
    }
    const availableBytes = await this.getAvailableDiskBytes(this.options.rootDirectory);
    if (availableBytes !== null && availableBytes < asset.size - offset) {
      throw new AppUpdateDownloadError("disk_space", "Not enough disk space for the update installer");
    }

    this.metadata = {
      schemaVersion: 1,
      status: "partial",
      asset,
      receivedBytes: offset,
      etag: this.metadata?.etag ?? null,
      lastModified: this.metadata?.lastModified ?? null
    };
    await this.writeMetadata(this.metadata);

    let response: Response | null = null;
    let append = offset > 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await this.request(asset, offset, signal);
      if (offset === 0 && this.isValidInitialResponse(response, asset)) break;
      if (offset > 0 && response.status === 206 && this.isValidResumeResponse(response, offset, asset)) break;
      if (offset > 0 && response.status === 200 && this.isValidInitialResponse(response, asset)) {
        await fs.rm(partialPath, { force: true }).catch(() => undefined);
        offset = 0;
        append = false;
        break;
      }

      await response.body?.cancel().catch(() => undefined);
      await fs.rm(partialPath, { force: true }).catch(() => undefined);
      offset = 0;
      append = false;
      this.metadata.receivedBytes = 0;
      this.metadata.etag = null;
      this.metadata.lastModified = null;
      await this.writeMetadata(this.metadata);
      response = null;
    }
    if (!response || !response.body) throw new AppUpdateDownloadError("invalid", "Update server returned an invalid range response");

    this.metadata.etag = response.headers.get("etag");
    this.metadata.lastModified = response.headers.get("last-modified");
    await this.writeMetadata(this.metadata);
    const fileHandle = await this.openPartialFile(partialPath, append);
    const reader = response.body.getReader();
    const cancelReader = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", cancelReader, { once: true });
    if (signal.aborted) cancelReader();
    let receivedBytes = offset;
    let lastProgressAt = 0;

    const emitProgress = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < 200) return;
      lastProgressAt = now;
      this.metadata!.receivedBytes = receivedBytes;
      await this.writeMetadata(this.metadata!);
      this.options.onProgress({ receivedBytes, totalBytes: asset.size, percent: percentFor(receivedBytes, asset.size), phase: "downloading" });
    };

    try {
      await emitProgress(true);
      while (true) {
        const { done, value } = await this.readNextChunk(reader);
        if (signal.aborted) throw new AppUpdateDownloadError("cancelled", "Update download was paused");
        if (done) break;
        if (!value) continue;
        receivedBytes += value.byteLength;
        if (receivedBytes > asset.size || receivedBytes > maximumUpdateInstallerBytes) {
          throw new AppUpdateDownloadError("invalid", "Update installer exceeds its trusted size");
        }
        await fileHandle.write(value);
        await emitProgress();
      }
      await fileHandle.sync();
      await fileHandle.close();
      await emitProgress(true);
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      signal.removeEventListener("abort", cancelReader);
      await fileHandle.close().catch(() => undefined);
    }

    if (receivedBytes !== asset.size) throw new AppUpdateDownloadError("incomplete", "Update installer download is incomplete");
    this.phase = "verifying";
    this.options.onProgress({ receivedBytes, totalBytes: asset.size, percent: 100, phase: "verifying" });
    const digest = await hashFile(partialPath);
    if (digest !== asset.digest) {
      await this.removeAssetFiles(asset);
      await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
      this.metadata = null;
      throw new AppUpdateDownloadError("invalid", "Update installer digest does not match the release asset");
    }
    await fs.rename(partialPath, finalPath);
    this.metadata = { ...this.metadata, status: "ready", receivedBytes: asset.size };
    await this.writeMetadata(this.metadata);
    this.options.onProgress({ receivedBytes: asset.size, totalBytes: asset.size, percent: 100, phase: "ready" });
  }

  private async request(asset: AppUpdateAsset, offset: number, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { "User-Agent": `Cap7CE/${this.options.currentVersion}` };
    if (offset > 0) {
      headers.Range = `bytes=${offset}-`;
      const ifRange = this.metadata?.etag || this.metadata?.lastModified;
      if (ifRange) headers["If-Range"] = ifRange;
    }
    try {
      const response = await this.fetchDownload(asset.downloadUrl, { method: "GET", headers, redirect: "follow", signal });
      if (response.status === 403 || response.status === 429) throw new AppUpdateDownloadError("rate_limited", `Update download was limited with status ${response.status}`);
      if (response.status !== 200 && response.status !== 206 && response.status !== 416) throw new AppUpdateDownloadError("network", `Update download failed with status ${response.status}`);
      return response;
    } catch (error) {
      if (error instanceof AppUpdateDownloadError) throw error;
      if (signal.aborted) throw new AppUpdateDownloadError("cancelled", "Update download was paused");
      throw new AppUpdateDownloadError("network", error instanceof Error ? error.message : "Update download connection failed");
    }
  }

  private isValidInitialResponse(response: Response, asset: AppUpdateAsset): boolean {
    if (response.status === 200) {
      const rawLength = response.headers.get("content-length");
      return rawLength === null || Number(rawLength) === asset.size;
    }
    if (response.status !== 206) return false;
    const range = parseContentRange(response.headers.get("content-range"));
    return Boolean(range && range.start === 0 && range.end < asset.size && range.total === asset.size);
  }

  private isValidResumeResponse(response: Response, offset: number, asset: AppUpdateAsset): boolean {
    const range = parseContentRange(response.headers.get("content-range"));
    if (!range || range.start !== offset || range.end < range.start || range.total !== asset.size) return false;
    const rawLength = response.headers.get("content-length");
    return rawLength === null || Number(rawLength) === range.end - range.start + 1;
  }

  private async readNextChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new AppUpdateDownloadError("network", "Update download stopped receiving data")), this.inactivityTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async openPartialFile(partialPath: string, append: boolean) {
    try {
      return await fs.open(partialPath, append ? "a" : "w");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      throw new AppUpdateDownloadError(code === "ENOSPC" ? "disk_space" : "security", error instanceof Error ? error.message : "Update installer could not be written");
    }
  }

  private normalizeError(error: unknown, aborted: boolean) {
    if (aborted) return new AppUpdateDownloadError("cancelled", "Update download was paused");
    if (error instanceof AppUpdateDownloadError) return error;
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOSPC") return new AppUpdateDownloadError("disk_space", String(error));
    if (code === "EACCES" || code === "EPERM" || code === "EBUSY" || code === "EIO") return new AppUpdateDownloadError("security", String(error));
    return new AppUpdateDownloadError("network", error instanceof Error ? error.message : String(error));
  }

  private async verifyInstaller(installerPath: string, asset: AppUpdateAsset): Promise<boolean> {
    const size = await this.fileSize(installerPath);
    return size === asset.size && await hashFile(installerPath).catch(() => "") === asset.digest;
  }

  private async readMetadata(): Promise<AppUpdateMetadata | null> {
    try { return parseMetadata(JSON.parse(await fs.readFile(this.metadataPath, "utf8"))); } catch { return null; }
  }

  private async writeMetadata(metadata: AppUpdateMetadata): Promise<void> {
    await fs.mkdir(this.options.rootDirectory, { recursive: true });
    const temporaryPath = `${this.metadataPath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await fs.rm(this.metadataPath, { force: true }).catch(() => undefined);
    await fs.rename(temporaryPath, this.metadataPath);
  }

  private async fileSize(filePath: string): Promise<number | null> {
    try { return (await fs.stat(filePath)).size; } catch { return null; }
  }

  private finalPath(asset: AppUpdateAsset): string {
    return path.join(this.options.rootDirectory, installerNameFor(asset.version));
  }

  private partialPath(asset: AppUpdateAsset): string {
    return `${this.finalPath(asset)}.part`;
  }

  private async removeAssetFiles(asset: AppUpdateAsset): Promise<void> {
    await Promise.all([
      fs.rm(this.finalPath(asset), { force: true }).catch(() => undefined),
      fs.rm(this.partialPath(asset), { force: true }).catch(() => undefined)
    ]);
  }

  private async removeObsoleteInstallers(): Promise<void> {
    const entries = await fs.readdir(this.options.rootDirectory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const match = entry.name.match(/^Cap7CE-Setup-(\d+\.\d+\.\d+)-x64\.exe(?:\.part)?$/);
      if (match && compareAppVersions(match[1], this.options.currentVersion) <= 0) {
        await fs.rm(path.join(this.options.rootDirectory, entry.name), { force: true }).catch(() => undefined);
      }
    }));
  }

  private async removeAllRecognizedUpdateFiles(): Promise<void> {
    const entries = await fs.readdir(this.options.rootDirectory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => (
      entry.isFile() && /^Cap7CE-Setup-\d+\.\d+\.\d+-x64\.exe(?:\.part)?$/.test(entry.name)
    )).map((entry) => fs.rm(path.join(this.options.rootDirectory, entry.name), { force: true }).catch(() => undefined)));
  }

  private clearMemoryState(): void {
    this.asset = null;
    this.metadata = null;
    this.phase = "idle";
  }
}
