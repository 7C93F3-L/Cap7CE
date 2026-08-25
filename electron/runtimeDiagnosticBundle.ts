import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { redactDiagnosticText, type RuntimeDiagnostics } from "./runtimeDiagnostics";

const perFileLimitBytes = 32 * 1024 * 1024;
const totalLimitBytes = 64 * 1024 * 1024;

const listFilesRecursively = async (root: string): Promise<string[]> => {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory() ? listFilesRecursively(absolutePath) : [absolutePath];
  }));
  return nested.flat();
};

const safeArchiveName = (prefix: string, filePath: string, index: number) => {
  const extension = path.extname(filePath).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 10);
  const basename = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `${prefix}/${String(index + 1).padStart(2, "0")}-${basename || `file${extension}`}`;
};

export interface RuntimeDiagnosticBundleOptions {
  diagnostics: RuntimeDiagnostics;
  destinationPath: string;
  appVersion: string;
  additionalLogPaths?: string[];
}

export const exportRuntimeDiagnosticBundle = async ({
  diagnostics,
  destinationPath,
  appVersion,
  additionalLogPaths = []
}: RuntimeDiagnosticBundleOptions): Promise<void> => {
  await diagnostics.flush();
  const logCandidates = [
    diagnostics.runtimeLogPath,
    ...Array.from({ length: 5 }, (_item, index) => `${diagnostics.runtimeLogPath}.${index + 1}`),
    ...additionalLogPaths
  ];
  const crashCandidates = (await listFilesRecursively(diagnostics.crashDirectory))
    .map((filePath) => ({ filePath, modifiedAt: 0 }))
    .slice(0, 50);
  await Promise.all(crashCandidates.map(async (candidate) => {
    const fileStats = await fs.stat(candidate.filePath).catch(() => null);
    candidate.modifiedAt = fileStats?.mtimeMs ?? 0;
  }));
  crashCandidates.sort((left, right) => right.modifiedAt - left.modifiedAt);

  const archive: Record<string, Uint8Array> = {};
  archive["diagnostics-summary.json"] = strToU8(JSON.stringify({
    exportedAt: new Date().toISOString(),
    appVersion,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    detailedLoggingEnabled: diagnostics.getInfo().detailedLoggingEnabled
  }, null, 2));

  let totalBytes = archive["diagnostics-summary.json"].byteLength;
  const collect = async (filePaths: string[], prefix: string, maximumFiles: number) => {
    let collected = 0;
    for (const filePath of filePaths) {
      if (collected >= maximumFiles || totalBytes >= totalLimitBytes) break;
      const fileStats = await fs.stat(filePath).catch(() => null);
      if (!fileStats?.isFile() || fileStats.size > perFileLimitBytes || totalBytes + fileStats.size > totalLimitBytes) continue;
      let content = await fs.readFile(filePath).catch(() => null);
      if (!content) continue;
      if ([".log", ".json", ".jsonl", ".txt"].includes(path.extname(filePath).toLowerCase())) {
        content = Buffer.from(redactDiagnosticText(content.toString("utf8")), "utf8");
      }
      archive[safeArchiveName(prefix, filePath, collected)] = new Uint8Array(content);
      totalBytes += content.byteLength;
      collected += 1;
    }
  };
  await collect(logCandidates, "logs", 10);
  await collect(crashCandidates.slice(0, 5).map((candidate) => candidate.filePath), "crashes", 5);

  const temporaryPath = `${destinationPath}.tmp`;
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.writeFile(temporaryPath, Buffer.from(zipSync(archive, { level: 6 })));
  await fs.rm(destinationPath, { force: true });
  await fs.rename(temporaryPath, destinationPath).catch(async (error) => {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  });
};
