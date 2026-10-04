import { spawn } from "node:child_process";
import { resolveWindowsPowerShellPath } from "./windowsPowerShellPath";
import { AUDIO_FACT_EXTRACTOR_VERSION, type AudioFactCandidate, type AudioFactResult } from "./audioFactTypes";

export const audioFactPowershellScript = [
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
  "    $channelValue=$item.ExtendedProperty('System.Audio.ChannelCount')",
  "    $duration=[long][Math]::Round(([double]$durationValue)/10000.0)",
  "    $channelCount=[int]$channelValue",
  "    if($duration -le 0 -or $channelCount -le 0){throw 'missing-audio-properties'}",
  "    $results+=[pscustomobject]@{id=[int]$entry.id;durationMs=$duration;channelCount=$channelCount}",
  "  } catch { $results+=[pscustomobject]@{id=[int]$entry.id;error='audio-properties-unavailable'} }",
  "}",
  "ConvertTo-Json -InputObject @($results) -Compress"
].join("\n");

const encodedCommand = Buffer.from(audioFactPowershellScript, "utf16le").toString("base64");
const failed = (candidate: AudioFactCandidate, errorCode: string): AudioFactResult => ({
  sourceRevision: candidate.sourceRevision,
  extractorVersion: AUDIO_FACT_EXTRACTOR_VERSION,
  status: "failed",
  durationMs: 0,
  channelCount: 0,
  errorCode
});

export const inspectAudioFactBatch = (
  candidates: AudioFactCandidate[],
  timeoutMs = 20_000
): Promise<AudioFactResult[]> => {
  if (candidates.length === 0) return Promise.resolve([]);
  if (process.platform !== "win32") return Promise.resolve(candidates.map((candidate) => failed(candidate, "audio-properties-platform-unsupported")));
  return new Promise((resolve) => {
    const child = spawn(resolveWindowsPowerShellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"]
    });
    let stdout = "";
    let settled = false;
    const finish = (results: AudioFactResult[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(results);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(candidates.map((candidate) => failed(candidate, "audio-properties-timeout")));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < 256 * 1024) stdout += chunk; });
    child.on("error", () => finish(candidates.map((candidate) => failed(candidate, "audio-properties-process-failed"))));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(candidates.map((candidate) => failed(candidate, "audio-properties-process-failed")));
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
          const channelCount = Number(row?.channelCount);
          return Number.isSafeInteger(durationMs) && durationMs > 0 && Number.isSafeInteger(channelCount) && channelCount > 0
            ? { sourceRevision: candidate.sourceRevision, extractorVersion: AUDIO_FACT_EXTRACTOR_VERSION, status: "indexed", durationMs, channelCount, errorCode: "" }
            : failed(candidate, typeof row?.error === "string" ? row.error : "audio-properties-unavailable");
        }));
      } catch {
        finish(candidates.map((candidate) => failed(candidate, "audio-properties-invalid-response")));
      }
    });
    child.stdin.end(JSON.stringify(candidates.map((candidate, id) => ({ id, filePath: candidate.filePath }))));
  });
};
