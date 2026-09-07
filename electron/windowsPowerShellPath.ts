import path from "node:path";

export const resolveWindowsPowerShellPath = (systemRoot = process.env.SystemRoot): string => path.join(
  systemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);
