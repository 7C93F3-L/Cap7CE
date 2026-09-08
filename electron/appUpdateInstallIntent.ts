import { promises as fs } from "node:fs";
import path from "node:path";
import { compareAppVersions } from "./appUpdateService";

const versionPattern = /^\d+\.\d+\.\d+$/;
const installIntentFileName = "install-intent.json";

interface AppUpdateInstallIntent {
  schemaVersion: 1;
  targetVersion: string;
}

const parseInstallIntent = (value: unknown): AppUpdateInstallIntent | null => {
  if (!value || typeof value !== "object") return null;
  const intent = value as Partial<AppUpdateInstallIntent>;
  return intent.schemaVersion === 1
    && typeof intent.targetVersion === "string"
    && versionPattern.test(intent.targetVersion)
    ? intent as AppUpdateInstallIntent
    : null;
};

export class AppUpdateInstallIntentStore {
  private readonly filePath: string;

  constructor(private readonly rootDirectory: string) {
    this.filePath = path.join(rootDirectory, installIntentFileName);
  }

  async record(targetVersion: string): Promise<void> {
    if (!versionPattern.test(targetVersion)) throw new TypeError("Invalid app update target version");
    await fs.mkdir(this.rootDirectory, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, targetVersion }, null, 2)}\n`, "utf8");
    await fs.rm(this.filePath, { force: true }).catch(() => undefined);
    await fs.rename(temporaryPath, this.filePath);
  }

  async getCompletedVersion(currentVersion: string): Promise<string | null> {
    if (!versionPattern.test(currentVersion)) return null;
    const intent = await this.read();
    if (!intent) return null;
    const comparison = compareAppVersions(intent.targetVersion, currentVersion);
    if (comparison < 0) {
      await this.clear(intent.targetVersion);
      return null;
    }
    return comparison === 0 ? currentVersion : null;
  }

  async clear(targetVersion: string): Promise<boolean> {
    const intent = await this.read();
    if (!intent || intent.targetVersion !== targetVersion) return false;
    await fs.rm(this.filePath, { force: true });
    return true;
  }

  private async read(): Promise<AppUpdateInstallIntent | null> {
    try {
      const intent = parseInstallIntent(JSON.parse(await fs.readFile(this.filePath, "utf8")));
      if (intent) return intent;
      await fs.rm(this.filePath, { force: true }).catch(() => undefined);
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        await fs.rm(this.filePath, { force: true }).catch(() => undefined);
      }
      return null;
    }
  }
}
