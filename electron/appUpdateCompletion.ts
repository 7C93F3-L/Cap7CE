import fs from "node:fs/promises";
import path from "node:path";

const versionPattern = /^\d+\.\d+\.\d+$/;

type AppUpdateCompletionOptions = {
  currentVersion: string;
  argumentVersion?: string | null;
  installMarkerPath: string;
  versionStatePath: string;
  legacyUserDataPaths?: string[];
};

const readVersionText = async (targetPath: string): Promise<string | null> => {
  try {
    const value = (await fs.readFile(targetPath, "utf8")).trim();
    return versionPattern.test(value) ? value : null;
  } catch {
    return null;
  }
};

const readPreviousVersion = async (targetPath: string): Promise<string | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(targetPath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" && versionPattern.test(parsed.version)
      ? parsed.version
      : null;
  } catch {
    return null;
  }
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const consumeAppUpdateCompletion = async ({
  currentVersion,
  argumentVersion,
  installMarkerPath,
  versionStatePath,
  legacyUserDataPaths = []
}: AppUpdateCompletionOptions): Promise<string | null> => {
  const [markerVersion, previousVersion, legacyUserDataPresence] = await Promise.all([
    readVersionText(installMarkerPath),
    readPreviousVersion(versionStatePath),
    Promise.all(legacyUserDataPaths.map(pathExists))
  ]);
  await fs.rm(installMarkerPath, { force: true }).catch(() => undefined);

  const normalizedCurrentVersion = versionPattern.test(currentVersion) ? currentVersion : null;
  const completedVersion = normalizedCurrentVersion && argumentVersion === normalizedCurrentVersion
    ? normalizedCurrentVersion
    : normalizedCurrentVersion && markerVersion === normalizedCurrentVersion && previousVersion !== normalizedCurrentVersion
      ? normalizedCurrentVersion
      : normalizedCurrentVersion && previousVersion && previousVersion !== normalizedCurrentVersion
        ? normalizedCurrentVersion
        : normalizedCurrentVersion && !previousVersion && legacyUserDataPresence.some(Boolean)
          ? normalizedCurrentVersion
          : null;

  await fs.mkdir(path.dirname(versionStatePath), { recursive: true });
  await fs.writeFile(versionStatePath, `${JSON.stringify({ version: currentVersion }, null, 2)}\n`, "utf8");
  return completedVersion;
};
