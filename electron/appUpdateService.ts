export type AppUpdateCheckStatus = "up_to_date" | "update_available" | "failed";

export interface AppUpdateCheckResult {
  status: AppUpdateCheckStatus;
  currentVersion: string;
  latestVersion?: string;
}

interface GitHubReleaseAsset {
  id?: unknown;
  name?: unknown;
  state?: unknown;
  size?: unknown;
  digest?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

export interface AppUpdateAsset {
  version: string;
  assetId: number;
  assetName: string;
  tagName: string;
  uploadState: "uploaded";
  size: number;
  digest: string;
  downloadUrl: string;
}

export interface AppUpdateResolution extends AppUpdateCheckResult {
  asset?: AppUpdateAsset;
}

const releasesApiUrl = "https://api.github.com/repos/7C93F3-L/Cap7CE/releases?per_page=20";
const releaseDownloadPathPrefix = "/7C93F3-L/Cap7CE/releases/download/";
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;
const digestPattern = /^sha256:([a-f0-9]{64})$/i;
export const maximumUpdateInstallerBytes = 1024 * 1024 * 1024;

const parseVersion = (version: string) => {
  const match = version.trim().match(versionPattern);
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 10));
};

export const compareAppVersions = (left: string, right: string) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
};

export const normalizeAppVersion = (version: string) => {
  const parsed = parseVersion(version);
  return parsed ? parsed.join(".") : "";
};

export const normalizeAppUpdateDigest = (digest: unknown): string | null => {
  if (typeof digest !== "string") return null;
  const match = digest.match(digestPattern);
  return match ? match[1].toLowerCase() : null;
};

export const isTrustedAppUpdateDownloadUrl = (downloadUrl: string, tagName: string, assetName: string) => {
  try {
    const parsed = new URL(downloadUrl);
    return parsed.protocol === "https:"
      && parsed.hostname === "github.com"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.pathname === `${releaseDownloadPathPrefix}${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
  } catch {
    return false;
  }
};

export const isValidAppUpdateAsset = (asset: AppUpdateAsset): boolean => (
  Boolean(normalizeAppVersion(asset.version))
  && Number.isSafeInteger(asset.assetId)
  && asset.assetId > 0
  && asset.assetName === `Cap7CE-Setup-${asset.version}-x64.exe`
  && asset.tagName === `v${asset.version}`
  && asset.uploadState === "uploaded"
  && Number.isSafeInteger(asset.size)
  && asset.size > 0
  && asset.size <= maximumUpdateInstallerBytes
  && /^[a-f0-9]{64}$/i.test(asset.digest)
  && isTrustedAppUpdateDownloadUrl(asset.downloadUrl, asset.tagName, asset.assetName)
);

export const selectLatestAppUpdate = (releases: unknown): AppUpdateAsset | null => {
  if (!Array.isArray(releases)) return null;

  const candidates = releases.flatMap((releaseValue) => {
    const release = releaseValue as GitHubRelease;
    if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string" || !Array.isArray(release.assets)) return [];

    const version = normalizeAppVersion(release.tag_name);
    if (!version || release.tag_name !== `v${version}`) return [];
    const assetName = `Cap7CE-Setup-${version}-x64.exe`;
    const asset = (release.assets as GitHubReleaseAsset[]).find((candidate) => candidate.name === assetName);
    if (!asset
      || asset.state !== "uploaded"
      || !Number.isSafeInteger(asset.id)
      || (asset.id as number) <= 0
      || !Number.isSafeInteger(asset.size)
      || (asset.size as number) <= 0
      || (asset.size as number) > maximumUpdateInstallerBytes
      || typeof asset.browser_download_url !== "string"
    ) return [];
    const digest = normalizeAppUpdateDigest(asset.digest);
    if (!digest || !isTrustedAppUpdateDownloadUrl(asset.browser_download_url, release.tag_name, assetName)) return [];

    const resolved: AppUpdateAsset = {
      version,
      assetId: asset.id as number,
      assetName,
      tagName: release.tag_name,
      uploadState: "uploaded",
      size: asset.size as number,
      digest,
      downloadUrl: asset.browser_download_url
    };
    return isValidAppUpdateAsset(resolved) ? [resolved] : [];
  });

  return candidates.sort((left, right) => compareAppVersions(right.version, left.version))[0] ?? null;
};

export const checkForAppUpdate = async (
  currentVersion: string,
  fetchReleases: typeof fetch = fetch
): Promise<AppUpdateResolution> => {
  const normalizedCurrentVersion = normalizeAppVersion(currentVersion);
  if (!normalizedCurrentVersion) return { status: "failed", currentVersion };

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
    if (!response.ok) return { status: "failed", currentVersion: normalizedCurrentVersion };

    const latestUpdate = selectLatestAppUpdate(await response.json());
    if (!latestUpdate) return { status: "failed", currentVersion: normalizedCurrentVersion };
    if (compareAppVersions(latestUpdate.version, normalizedCurrentVersion) <= 0) {
      return { status: "up_to_date", currentVersion: normalizedCurrentVersion, latestVersion: latestUpdate.version };
    }
    return {
      status: "update_available",
      currentVersion: normalizedCurrentVersion,
      latestVersion: latestUpdate.version,
      asset: latestUpdate
    };
  } catch {
    return { status: "failed", currentVersion: normalizedCurrentVersion };
  } finally {
    clearTimeout(timeout);
  }
};
