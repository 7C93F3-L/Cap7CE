import { spawn } from "node:child_process";
import { resolveWindowsPowerShellPath } from "./windowsPowerShellPath";
import { windowsShellRenameScript } from "./windowsShellRenameScript";

export interface ShellRenameOutcome { status: "renamed" | "cancelled" | "failed"; path?: string; error?: number }
export function renameDirectoryWithWindowsShell(source: string, name: string, owner: string): Promise<ShellRenameOutcome> {
  if (process.platform !== "win32") return Promise.reject(new Error("folder-rename-windows-only"));
  return new Promise((resolve, reject) => {
    const child = spawn(resolveWindowsPowerShellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-EncodedCommand",
      Buffer.from(windowsShellRenameScript, "utf16le").toString("base64")], { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    const stop = () => child.kill(); process.once("exit", stop);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; if (output.length > 65536) child.kill(); });
    child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-8192); });
    child.once("error", reject); child.stdin.on("error", reject);
    child.once("close", code => {
      process.removeListener("exit", stop);
      try {
        if (code !== 0) throw new Error(errors.trim() || "folder-rename-process-failed");
        const result = JSON.parse(output.trim()) as ShellRenameOutcome;
        if (!["renamed", "cancelled", "failed"].includes(result.status)
          || result.status === "renamed" && typeof result.path !== "string") throw new Error("folder-rename-invalid-result");
        resolve(result);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify({ path: source, name, owner }));
  });
}
