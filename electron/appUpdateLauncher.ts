import path from "node:path";

export interface AppUpdateHelperLaunchRequest {
  helperPath: string;
  packagePath: string;
  installDirectory: string;
  expectedVersion: string;
  currentProcessId: number;
  executableName: string;
  failureCloseDelaySeconds?: number;
}

export const resolveWindowsPowerShellPath = (systemRoot = process.env.SystemRoot): string => path.join(
  systemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

const quotePowerShellLiteral = (value: string | number): string => `'${String(value).replace(/'/g, "''")}'`;

export const createAppUpdateLauncherScript = (request: AppUpdateHelperLaunchRequest): string => {
  const helperCommand = [
    "&",
    quotePowerShellLiteral(request.helperPath),
    "-PackagePath",
    quotePowerShellLiteral(request.packagePath),
    "-InstallDirectory",
    quotePowerShellLiteral(request.installDirectory),
    "-ExpectedVersion",
    quotePowerShellLiteral(request.expectedVersion),
    "-CurrentProcessId",
    quotePowerShellLiteral(request.currentProcessId),
    "-ExecutableName",
    quotePowerShellLiteral(request.executableName),
    ...(request.failureCloseDelaySeconds === undefined
      ? []
      : ["-FailureCloseDelaySeconds", quotePowerShellLiteral(request.failureCloseDelaySeconds)])
  ].join(" ");
  const encodedCommand = Buffer.from([
    "$ErrorActionPreference = 'Stop'",
    helperCommand,
    "exit $LASTEXITCODE"
  ].join("\r\n"), "utf16le").toString("base64");

  // Keep the launcher strictly ASCII; all user paths live inside EncodedCommand.
  return [
    "Option Explicit",
    "Dim updateShell, powerShellPath, updateCommand, updateExitCode",
    "Set updateShell = CreateObject(\"WScript.Shell\")",
    "powerShellPath = updateShell.ExpandEnvironmentStrings(\"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\")",
    `updateCommand = Chr(34) & powerShellPath & Chr(34) & " -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}"`,
    "updateExitCode = updateShell.Run(updateCommand, 0, True)",
    "WScript.Quit updateExitCode",
    ""
  ].join("\r\n");
};
