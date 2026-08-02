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

const releasesApiUrl = "https://api.github.com/repos/7C93F3-L/Cap7CE/releases?per_page=20";
const releaseDownloadPathPrefix = "/7C93F3-L/Cap7CE/releases/download/";
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

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
