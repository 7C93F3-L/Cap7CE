import { spawn } from "node:child_process";
import { resolveWindowsPowerShellPath } from "./windowsPowerShellPath";
import { VIDEO_FACT_EXTRACTOR_VERSION, type VideoFactCandidate, type VideoFactResult } from "./videoFactTypes";

export const videoFactPowershellScript = [
  "$ErrorActionPreference='Stop'",
  "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)",
  "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
  "$items=[Console]::In.ReadToEnd()|ConvertFrom-Json",
  "$shell=New-Object -ComObject Shell.Application",
  "$results=@()",
  "foreach($entry in $items){",
  "  try {",
  "    $filePath=[string]$entry.filePath",
  "    $folder=$shell.Namespace([System.IO.Path]::GetDirectoryName($filePath))",
  "    $item=$folder.ParseName([System.IO.Path]::GetFileName($filePath))",
  "    if($null -eq $item){throw 'missing-shell-item'}",
  "    $durationValue=$item.ExtendedProperty('System.Media.Duration')",
  "    $widthValue=$item.ExtendedProperty('System.Video.FrameWidth')",
  "    $heightValue=$item.ExtendedProperty('System.Video.FrameHeight')",
  "    $duration=[long][Math]::Round(([double]$durationValue)/10000.0)",
  "    $width=[int]$widthValue",
  "    $height=[int]$heightValue",
  "    if($duration -le 0 -or $width -le 0 -or $height -le 0){throw 'missing-video-properties'}",
  "    $results+=[pscustomobject]@{id=[int]$entry.id;durationMs=$duration;width=$width;height=$height}",
  "  } catch { $results+=[pscustomobject]@{id=[int]$entry.id;error='video-properties-unavailable'} }",
  "}",
"ConvertTo-Json -InputObject @($results) -Compress"
].join("\n");

const encodedCommand = Buffer.from(videoFactPowershellScript, "utf16le").toString("base64");
const failed = (candidate: VideoFactCandidate, errorCode: string): VideoFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: VIDEO_FACT_EXTRACTOR_VERSION,
  status: "failed",
  durationMs: 0,
  width: 0,
  height: 0,
  errorCode
});

export const inspectVideoFactBatch = (
  candidates: VideoFactCandidate[],
  timeoutMs = 20_000
): Promise<VideoFactResult[]> => {
  if (candidates.length === 0) return Promise.resolve([]);
  if (process.platform !== "win32") return Promise.resolve(candidates.map((candidate) => failed(candidate, "video-properties-platform-unsupported")));
  return new Promise((resolve) => {
    const child = spawn(resolveWindowsPowerShellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"]
    });
    let stdout = "";
    let settled = false;
    const finish = (results: VideoFactResult[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(results);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(candidates.map((candidate) => failed(candidate, "video-properties-timeout")));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < 256 * 1024) stdout += chunk; });
    child.on("error", () => finish(candidates.map((candidate) => failed(candidate, "video-properties-process-failed"))));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(candidates.map((candidate) => failed(candidate, "video-properties-process-failed")));
      try {
        const parsed = JSON.parse(stdout.trim()) as unknown;
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const byId = new Map(rows.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const record = row as Record<string, unknown>;
          return Number.isInteger(record.id) ? [[Number(record.id), record] as const] : [];
        }));
        finish(candidates.map((candidate, id) => {
          const row = byId.get(id);
          const durationMs = Number(row?.durationMs);
          const width = Number(row?.width);
          const height = Number(row?.height);
          return Number.isSafeInteger(durationMs) && durationMs > 0 && Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
            ? { sourceRevision: candidate.sourceRevision, extractorVersion: VIDEO_FACT_EXTRACTOR_VERSION, status: "indexed", durationMs, width, height, errorCode: "" }
            : failed(candidate, typeof row?.error === "string" ? row.error : "video-properties-unavailable");
        }));
      } catch {
        finish(candidates.map((candidate) => failed(candidate, "video-properties-invalid-response")));
      }
    });
    child.stdin.end(JSON.stringify(candidates.map((candidate, id) => ({ id, filePath: candidate.filePath }))));
  });
};
