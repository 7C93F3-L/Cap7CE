import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveWindowsPowerShellPath } from "./appUpdateLauncher";

const execFileAsync = promisify(execFile);

export interface WindowsKnownFolderDisplayNameRequest {
  id: string;
  path: string | null;
  knownFolderId?: string;
  classId?: string;
}

let cachedDisplayNames: Promise<Map<string, string>> | null = null;

const createEncodedCommand = (requests: readonly WindowsKnownFolderDisplayNameRequest[]) => {
  const payload = Buffer.from(JSON.stringify(requests), "utf8").toString("base64");
  const command = [
    "$ErrorActionPreference='Stop'",
    "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Text;",
    "using System.Runtime.InteropServices;",
    "public static class Cap7CEKnownFolderName {",
    "  [DllImport(\"shlwapi.dll\", CharSet=CharSet.Unicode)] public static extern int SHLoadIndirectString(string source, StringBuilder output, uint count, IntPtr reserved);",
    "  [DllImport(\"kernel32.dll\", CharSet=CharSet.Unicode)] private static extern bool SetThreadPreferredUILanguages(uint flags, string languages, out uint count);",
    "  [DllImport(\"kernel32.dll\", CharSet=CharSet.Unicode)] private static extern bool SetProcessPreferredUILanguages(uint flags, string languages, out uint count);",
    "  public static void SetLanguage(string language) { uint count; SetProcessPreferredUILanguages(8, language + \"\\0\", out count); SetThreadPreferredUILanguages(8, language + \"\\0\", out count); }",
    "  public static string Load(string source) { var output=new StringBuilder(520); return SHLoadIndirectString(Environment.ExpandEnvironmentVariables(source),output,520,IntPtr.Zero)==0 ? output.ToString() : \"\"; }",
    "}",
    "'@",
    "$language=(Get-WinSystemLocale).Name",
    "[Cap7CEKnownFolderName]::SetLanguage([string]$language)",
    `$items=([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payload}'))|ConvertFrom-Json)`,
    "$shell=New-Object -ComObject Shell.Application",
    "$result=@{}",
    "foreach($entry in $items){",
    "  try {",
    "    if($null -ne $entry.knownFolderId){$key='Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FolderDescriptions\\'+[string]$entry.knownFolderId;$source=(Get-ItemProperty $key).LocalizedName;$name=[Cap7CEKnownFolderName]::Load([string]$source)}",
    "    elseif($null -ne $entry.classId){$key='Registry::HKEY_CLASSES_ROOT\\CLSID\\'+[string]$entry.classId;$source=(Get-ItemProperty $key).LocalizedString;$name=[Cap7CEKnownFolderName]::Load([string]$source)}",
    "    else {$parent=[System.IO.Path]::GetDirectoryName([string]$entry.path);$leaf=[System.IO.Path]::GetFileName([string]$entry.path);$folder=$shell.Namespace($parent);$item=$folder.ParseName($leaf);$name=$item.Name}",
    "    if(-not [string]::IsNullOrWhiteSpace($name)){$result[[string]$entry.id]=[string]$name}",
    "  } catch {}",
    "}",
    "if($language.StartsWith('zh')){$zh=@{computer='此电脑';desktop='桌面';downloads='下载';documents='文档';pictures='图片';music='音乐';videos='视频'};foreach($id in $zh.Keys){if($result.ContainsKey($id)){$result[$id]=$zh[$id]}}}",
    "$result|ConvertTo-Json -Compress"
  ].join("\n");
  return Buffer.from(command, "utf16le").toString("base64");
};

export const getWindowsKnownFolderDisplayNames = async (
  requests: readonly WindowsKnownFolderDisplayNameRequest[]
): Promise<Map<string, string>> => {
  if (process.platform !== "win32") return new Map();
  if (!cachedDisplayNames) {
    cachedDisplayNames = execFileAsync(resolveWindowsPowerShellPath(), [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      createEncodedCommand(requests)
    ], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    }).then(({ stdout }) => {
      const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
      return new Map(Object.entries(parsed).flatMap(([id, name]) => (
        typeof name === "string" && name.trim() ? [[id, name.trim()] as const] : []
      )));
    }).catch(() => new Map());
  }
  return cachedDisplayNames;
};
