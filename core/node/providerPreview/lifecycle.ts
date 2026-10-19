import { Worker, type WorkerOptions } from "node:worker_threads";
import { spawn, type SpawnOptions, type ChildProcess } from "node:child_process";
const workers = new Set<Worker>(), children = new Set<ChildProcess>();
export const createPreviewWorker = (file: string, options: WorkerOptions) => {
  const worker = new Worker(file, { ...options, execArgv: [], stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 512, stackSizeMb: 4 } });
  workers.add(worker); worker.stdout!.resume(); worker.stderr!.resume(); worker.once("exit", () => workers.delete(worker)); return worker;
};
export const spawnPreviewWorker = (file: string, args: string[], options: SpawnOptions) => {
  const child = spawn(file, args, options); children.add(child); child.once("close", () => children.delete(child)); return child;
};
export const releasePreviewWorkers = async () => {
  await Promise.all([...workers].map(worker => worker.terminate()));
  await Promise.all([...children].map(child => new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) { children.delete(child); resolve(); return; }
    child.once("close", () => { clearTimeout(timer); resolve(); }); const timer = setTimeout(() => { child.kill("SIGKILL"); reject(Error("core-preview-release-failed")); }, 1000); child.kill();
  })));
};
