import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

// Keep the native supervisor alive long enough to stop its Job and remove only its own scratch tree.
export const stopCoreVisualHost = (executable: string, child: ChildProcessWithoutNullStreams, nonce: string): void => {
  if (!child.pid) { child.kill(); return; }
  try {
    const stop = spawn(executable, ["--stop", String(child.pid), nonce], { windowsHide: true, shell: false, stdio: "ignore" });
    stop.once("error", () => child.kill()); stop.once("exit", code => { if (code !== 0) child.kill(); }); stop.unref();
    child.stdin.end();
  } catch { child.kill(); }
};
