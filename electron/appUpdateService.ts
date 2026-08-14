import { promises as fs } from "node:fs";
import path from "node:path";

export type AppUpdateCheckStatus = "up_to_date" | "update_available" | "failed";

export interface AppUpdateCheckResult {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  latestVersion?: string;
}

interface GitHubReleaseAsset {
  name?: unknown;
  state?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  draft?: unknown;
  assets?: unknown;
}

export interface AppUpdateDownload {
  version: string;
  downloadUrl: string;
}

export interface AppUpdateResolution extends AppUpdateCheckResult {
  downloadUrl?: string;
}

export interface AppUpdateDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  completed?: boolean;
}

export type AppUpdateDownloadErrorCode = "cancelled" | "rate_limited" | "network" | "disk_space" | "security" | "incomplete" | "invalid" | "unknown";

export class AppUpdateDownloadError extends Error {
  constructor(public readonly code: AppUpdateDownloadErrorCode, message: string) {
    super(message);
    this.name = "AppUpdateDownloadError";
  }
}

const releasesApiUrl = "https://api.github.com/repos/7C93F3-L/Cap7CE/releases?per_page=20";
const releaseDownloadPathPrefix = "/7C93F3-L/Cap7CE/releases/download/";
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;
const maximumUpdatePackageBytes = 1024 * 1024 * 1024;
const defaultDownloadInactivityTimeoutMs = 60_000;

const parseVersion = (version: string) => {
  const match = version.trim().match(versionPattern);
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 10));
};

const compareVersions = (left: string, right: string) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
};

const normalizeVersion = (version: string) => {
  const parsed = parseVersion(version);
  return parsed ? parsed.join(".") : "";
};

const isTrustedDownloadUrl = (downloadUrl: string, tagName: string, assetName: string) => {
  try {
    const parsed = new URL(downloadUrl);
    return parsed.protocol === "https:"
      && parsed.hostname === "github.com"
      && parsed.pathname === `${releaseDownloadPathPrefix}${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
  } catch {
    return false;
  }
};

export const selectLatestAppUpdate = (releases: unknown): AppUpdateDownload | null => {
  if (!Array.isArray(releases)) return null;

  const candidates = releases.flatMap((releaseValue) => {
    const release = releaseValue as GitHubRelease;
    if (release.draft === true || typeof release.tag_name !== "string" || !Array.isArray(release.assets)) {
      return [];
    }

    const version = normalizeVersion(release.tag_name);
    if (!version) return [];
    const assetName = `Cap7CE-${version}-win-x64.zip`;
    const asset = (release.assets as GitHubReleaseAsset[]).find((candidate) => (
      candidate.name === assetName
      && candidate.state === "uploaded"
      && typeof candidate.browser_download_url === "string"
      && isTrustedDownloadUrl(candidate.browser_download_url, release.tag_name as string, assetName)
    ));
    if (!asset || typeof asset.browser_download_url !== "string") return [];

    return [{
      version,
      downloadUrl: asset.browser_download_url
    }];
  });

  return candidates.sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
};

export const checkForAppUpdate = async (
  currentVersion: string,
  fetchReleases: typeof fetch = fetch
): Promise<AppUpdateResolution> => {
  const normalizedCurrentVersion = normalizeVersion(currentVersion);
  if (!normalizedCurrentVersion) {
    return { status: "failed", currentVersion };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchReleases(releasesApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `Cap7CE/${normalizedCurrentVersion}`
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return { status: "failed", currentVersion: normalizedCurrentVersion };
    }

    const latestUpdate = selectLatestAppUpdate(await response.json());
    if (!latestUpdate) {
      return { status: "failed", currentVersion: normalizedCurrentVersion };
    }
    if (compareVersions(latestUpdate.version, normalizedCurrentVersion) <= 0) {
      return {
        status: "up_to_date",
        currentVersion: normalizedCurrentVersion,
        latestVersion: latestUpdate.version
      };
    }

    return {
      status: "update_available",
      currentVersion: normalizedCurrentVersion,
      latestVersion: latestUpdate.version,
      downloadUrl: latestUpdate.downloadUrl
    };
  } catch {
    return { status: "failed", currentVersion: normalizedCurrentVersion };
  } finally {
    clearTimeout(timeout);
  }
};

export const downloadAppUpdate = async (
  update: AppUpdateDownload,
  destinationPath: string,
  onProgress: (progress: AppUpdateDownloadProgress) => void,
  fetchDownload: typeof fetch = fetch,
  inactivityTimeoutMs = defaultDownloadInactivityTimeoutMs,
  signal?: AbortSignal
) => {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const partialPath = `${destinationPath}.part`;
  let response: Response;
  try {
    response = await fetchDownload(update.downloadUrl, {
      method: "GET",
      headers: { "User-Agent": `Cap7CE/${update.version}` },
      redirect: "follow",
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw new AppUpdateDownloadError("cancelled", "Update download was cancelled");
    throw new AppUpdateDownloadError("network", error instanceof Error ? error.message : "Update download connection failed");
  }
  if (!response.ok || !response.body) {
    const code = response.status === 403 || response.status === 429 ? "rate_limited" : "network";
    throw new AppUpdateDownloadError(code, `Update download failed with status ${response.status}`);
  }
  if (signal?.aborted) throw new AppUpdateDownloadError("cancelled", "Update download was cancelled");

  const declaredLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  const totalBytes = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null;
  if (totalBytes !== null && totalBytes > maximumUpdatePackageBytes) {
    throw new Error("Update package exceeds the maximum allowed size");
  }

  let fileHandle: Awaited<ReturnType<typeof fs.open>>;
  try {
    fileHandle = await fs.open(partialPath, "wx");
  } catch (error) {
    const fileErrorCode = (error as NodeJS.ErrnoException)?.code;
    throw new AppUpdateDownloadError(fileErrorCode === "ENOSPC" ? "disk_space" : "security", error instanceof Error ? error.message : "Update download file could not be opened");
  }
  const reader = response.body.getReader();
  const cancelReader = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancelReader, { once: true });
  if (signal?.aborted) cancelReader();
  let receivedBytes = 0;
  let lastProgressAt = 0;
  let completed = false;
  const readNextChunk = async () => {
    let inactivityTimer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          inactivityTimer = setTimeout(() => {
            reject(new AppUpdateDownloadError("network", "Update download stopped receiving data"));
          }, inactivityTimeoutMs);
        })
      ]);
    } finally {
      if (inactivityTimer !== null) clearTimeout(inactivityTimer);
    }
  };
  const emitProgress = (force = false, completed = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < 200) return;
    lastProgressAt = now;
    onProgress({
      receivedBytes,
      totalBytes,
      percent: totalBytes === null ? null : Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
      completed
    });
  };

  try {
    emitProgress(true);
    while (true) {
      const { done, value } = await readNextChunk();
      if (signal?.aborted) throw new AppUpdateDownloadError("cancelled", "Update download was cancelled");
      if (done) break;
      if (!value) continue;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumUpdatePackageBytes) {
        throw new Error("Update package exceeds the maximum allowed size");
      }
      await fileHandle.write(value);
      emitProgress();
    }
    if (receivedBytes === 0 || (totalBytes !== null && receivedBytes !== totalBytes)) {
      throw new AppUpdateDownloadError("incomplete", "Update package download is incomplete");
    }
    await fileHandle.sync();
    await fileHandle.close();
    await fs.rename(partialPath, destinationPath);
    emitProgress(true, true);
    completed = true;
    return { packagePath: destinationPath, receivedBytes, totalBytes };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal?.aborted && !(error instanceof AppUpdateDownloadError)) {
      throw new AppUpdateDownloadError("cancelled", "Update download was cancelled");
    }
    if (!(error instanceof AppUpdateDownloadError)) {
      const fileErrorCode = (error as NodeJS.ErrnoException)?.code;
      if (fileErrorCode === "ENOSPC") {
        throw new AppUpdateDownloadError("disk_space", error instanceof Error ? error.message : "Update download ran out of disk space");
      }
      if (fileErrorCode === "EACCES" || fileErrorCode === "EPERM" || fileErrorCode === "EBUSY" || fileErrorCode === "EIO") {
        throw new AppUpdateDownloadError("security", error instanceof Error ? error.message : "Update download file could not be written");
      }
      throw new AppUpdateDownloadError("network", error instanceof Error ? error.message : "Update download connection failed");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    await fileHandle.close().catch(() => undefined);
    if (!completed) {
      await fs.rm(partialPath, { force: true }).catch(() => undefined);
      await fs.rm(destinationPath, { force: true }).catch(() => undefined);
    }
  }
};
