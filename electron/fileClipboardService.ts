import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export const normalizeFilePathsForClipboard = (
  candidates: unknown,
  platform: NodeJS.Platform = process.platform
) => {
  if (!Array.isArray(candidates)) return [];
  const normalizedPaths = new Map<string, string>();
  for (const candidate of candidates.slice(0, 1_000)) {
    if (typeof candidate !== "string") continue;
    const trimmedPath = candidate.trim();
    if (!path.isAbsolute(trimmedPath)) continue;
    const normalizedPath = path.normalize(path.resolve(trimmedPath));
    const key = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
    if (!normalizedPaths.has(key)) normalizedPaths.set(key, normalizedPath);
  }
  return [...normalizedPaths.values()];
};

export const formatFilePathsForClipboard = (candidates: unknown) => (
  normalizeFilePathsForClipboard(candidates).join("\r\n")
);

const fileClipboardPowerShellScript = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json",
  "$paths = @($payload)",
  "if ($paths.Count -eq 0) { throw 'No file paths were provided.' }",
  "Set-Clipboard -LiteralPath $paths"
].join("; ");

const validateFileClipboardPaths = async (candidates: unknown) => {
  const normalizedPaths = normalizeFilePathsForClipboard(candidates);
  if (normalizedPaths.length === 0) throw new Error("No valid file paths were provided.");
  for (const filePath of normalizedPaths) {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(`Clipboard path is not a file or folder: ${filePath}`);
    }
    if (stat.isDirectory() && path.parse(filePath).root === filePath) {
      throw new Error(`Drive roots cannot be copied: ${filePath}`);
    }
  }
  return normalizedPaths;
};

export const copyFileItemsToClipboard = async (candidates: unknown) => {
  if (process.platform !== "win32") throw new Error("File clipboard is only supported on Windows.");
  const filePaths = await validateFileClipboardPaths(candidates);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-Command",
      fileClipboardPowerShellScript
    ], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"]
    });
    let settled = false;
    let stderr = "";
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const timeoutId = setTimeout(() => {
      child.kill();
      finish(new Error("File clipboard operation timed out."));
    }, 10_000);
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `File clipboard process exited with code ${code ?? "unknown"}.`));
    });
    child.stdin.once("error", (error) => finish(error));
    child.stdin.end(JSON.stringify(filePaths), "utf8");
  });
  return filePaths.length;
};
