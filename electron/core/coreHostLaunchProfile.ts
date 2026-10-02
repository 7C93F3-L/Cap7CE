import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CoreHostLaunchMode = "probe" | "product";

export interface CoreHostLaunchProfile {
  pipeName: string;
  arguments: string[];
  cleanup: () => Promise<void>;
}

export const createCoreHostLaunchProfile = (
  mode: CoreHostLaunchMode,
  token: string
): CoreHostLaunchProfile => {
  if (mode === "product") {
    return {
      pipeName: `cap7ce-core-p35-${token}`,
      arguments: ["--catalog-server", "--pipe-name", `cap7ce-core-p35-${token}`],
      cleanup: async () => undefined
    };
  }
  return {
    pipeName: `cap7ce-core-p32-${token}`,
    arguments: ["--catalog-controller-probe", "--pipe-name", `cap7ce-core-p32-${token}`],
    cleanup: async () => {
      const probeRoot = path.join(os.tmpdir(), `Cap7CE-Core-P32-${token}`);
      await rm(probeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
        .catch(() => undefined);
    }
  };
};

export const waitForExit = (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
};

export const withTimeout = async (work: Promise<void>, timeoutMs: number): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const result = await Promise.race([work.then(() => true, () => true), timedOut]);
  if (timer) clearTimeout(timer);
  return result;
};
