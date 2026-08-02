import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { getGgufModelSettings, getSelectedGgufModelRuntime, type GgufModelSettingsStatus } from "./ggufModelStore";
import { getLlamaRuntimeSettings } from "./llamaRuntimeStore";

export type LlamaRuntimeProcessStatus = "stopped" | "starting" | "running" | "failed";
export type GgufModelLoadStatus = "unselected" | "unpaired" | "ready" | "loading" | "loaded" | "load_failed";

export interface LlamaRuntimeProcessState {
  status: LlamaRuntimeProcessStatus;
  host: string;
  port: number | null;
  selectedVersion: string;
  pid?: number;
  startedAt?: string;
  message?: string;
  modelStatus: GgufModelLoadStatus;
  selectedModelId: string;
  loadedModelName?: string;
  modelMessage?: string;
  healthUrl: string;
  logPath: string;
}

export interface LlamaRuntimeConnection {
  baseUrl: string;
  modelName: string;
}

const runtimeHost = "127.0.0.1";
const firstRuntimePort = 18080;
const runtimePortCandidateCount = 100;
const startupTimeoutMs = 180_000;
const healthPollIntervalMs = 250;
const healthMonitorIntervalMs = 2_000;
const maximumHealthFailures = 3;

let managedProcess: ChildProcess | null = null;
let startPromise: Promise<LlamaRuntimeProcessState> | null = null;
let currentPort: number | null = null;
let stopRequested = false;
let healthMonitor: NodeJS.Timeout | null = null;
let healthCheckInProgress = false;
let consecutiveHealthFailures = 0;
let logWriteQueue = Promise.resolve();
let shutdownHandlerRegistered = false;
let allowAppQuit = false;
const stateListeners = new Set<(state: LlamaRuntimeProcessState) => void>();

const getLogPath = () => path.join(app.getPath("userData"), "logs", "llama-runtime.log");
const getBaseUrl = (port = currentPort) => port === null ? "" : `http://${runtimeHost}:${port}`;
const getHealthUrl = (port = currentPort) => {
  const baseUrl = getBaseUrl(port);
  return baseUrl ? `${baseUrl}/health` : "";
};

let currentState: LlamaRuntimeProcessState = {
  status: "stopped",
  host: runtimeHost,
  port: null,
  selectedVersion: "",
  modelStatus: "unselected",
  selectedModelId: "",
  healthUrl: getHealthUrl(),
  logPath: ""
};

const snapshotState = (): LlamaRuntimeProcessState => ({
  ...currentState,
  logPath: getLogPath()
});

const setState = (nextState: LlamaRuntimeProcessState) => {
  currentState = nextState;
  const snapshot = snapshotState();
  for (const listener of stateListeners) {
    listener(snapshot);
  }
  return snapshot;
};

const appendRuntimeLog = (message: string) => {
  logWriteQueue = logWriteQueue.then(async () => {
    const targetPath = getLogPath();
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.appendFile(targetPath, `[${new Date().toISOString()}] ${message.trimEnd()}\n`, "utf8");
  }).catch((error) => {
    console.warn("[llama-runtime] log write failed", error);
  });
  return logWriteQueue;
};

const quoteCommandArgument = (argument: string) => (
  /[\s"]/.test(argument) ? `"${argument.replace(/"/g, '\\"')}"` : argument
);

const summarizeProcessError = (output: string) => {
  const lines = output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-2).join(" ").slice(0, 500);
};

const isPortBindingFailure = (output: string) => (
  /address already in use|permission denied|winerror\s*(?:10013|10048)|eaddrinuse|eacces|10013|10048|forbidden by its access permissions|only one usage of each socket address/i.test(output)
);

export const findAvailableLlamaRuntimePort = async (startOffset = 0) => {
  for (let offset = startOffset; offset < runtimePortCandidateCount; offset += 1) {
    const port = firstRuntimePort + offset;
    const result = await probePort(port);
    if (result.available) {
      await appendRuntimeLog(`端口探测成功：${runtimeHost}:${port}`);
      return { port, nextOffset: offset + 1 };
    }
    await appendRuntimeLog(
      `端口探测失败：${runtimeHost}:${port}，code=${result.code ?? "unknown"}，message=${result.message ?? "unknown"}`
    );
  }
  return null;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface PortProbeResult {
  available: boolean;
  code?: string;
  message?: string;
}

const probePort = (port: number) => new Promise<PortProbeResult>((resolve) => {
  const server = net.createServer();
  server.unref();
  server.once("error", (error: NodeJS.ErrnoException) => {
    resolve({
      available: false,
      code: error.code,
      message: error.message
    });
  });
  server.listen({ host: runtimeHost, port, exclusive: true }, () => {
    server.close((error) => {
      if (error) {
        const closeError = error as NodeJS.ErrnoException;
        resolve({
          available: false,
          code: closeError.code,
          message: closeError.message
        });
        return;
      }
      resolve({ available: true });
    });
  });
});

const checkHealth = async () => {
  const healthUrl = getHealthUrl();
  if (!healthUrl) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return false;
    }
    const body = await response.json().catch(() => null) as { status?: unknown } | null;
    return body?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const modelLoadStatusFromSettings = (status: GgufModelSettingsStatus): GgufModelLoadStatus => {
  if (status === "ready") return "ready";
  if (status === "unpaired") return "unpaired";
  return "unselected";
};

const isExpectedModelLoaded = async (expectedModelName: string) => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return false;
    }

    const body = await response.json().catch(() => null) as {
      models?: Array<{ name?: unknown; model?: unknown }>;
      data?: Array<{ id?: unknown }>;
    } | null;
    const loadedNames = [
      ...(body?.models ?? []).flatMap((model) => [model.name, model.model]),
      ...(body?.data ?? []).map((model) => model.id)
    ].filter((name): name is string => typeof name === "string");
    return loadedNames.some((name) => name.toLowerCase() === expectedModelName.toLowerCase());
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const clearHealthMonitor = () => {
  if (healthMonitor) {
    clearInterval(healthMonitor);
    healthMonitor = null;
  }
  healthCheckInProgress = false;
  consecutiveHealthFailures = 0;
};

const waitForProcessExit = async (child: ChildProcess, timeoutMs: number) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return Promise.race([
    new Promise<boolean>((resolve) => {
      child.once("exit", () => resolve(true));
    }),
    wait(timeoutMs).then(() => false)
  ]);
};

const terminatePortAttempt = async (child: ChildProcess, reason: string) => {
  await appendRuntimeLog(`清理端口启动尝试：PID=${child.pid ?? "unknown"}，原因：${reason}`);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    const exited = await waitForProcessExit(child, 5_000);
    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await waitForProcessExit(child, 1_000);
    }
  }
  if (managedProcess === child) {
    managedProcess = null;
  }
  currentPort = null;
};

const terminateManagedProcess = async (reason: string) => {
  clearHealthMonitor();
  stopRequested = true;
  const child = managedProcess;
  if (!child) {
    currentPort = null;
    return;
  }

  await appendRuntimeLog(`停止 llama-server，PID=${child.pid ?? "unknown"}，原因：${reason}`);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    const exited = await waitForProcessExit(child, 5_000);
    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await waitForProcessExit(child, 1_000);
    }
  }

  if (managedProcess === child) {
    managedProcess = null;
  }
  currentPort = null;
};

const failStartup = async (
  selectedVersion: string,
  selectedModelId: string,
  message: string,
  modelStatus: GgufModelLoadStatus = "load_failed"
) => {
  await terminateManagedProcess("启动失败清理");
  await appendRuntimeLog(`启动失败：${message}`);
  return setState({
    status: "failed",
    host: runtimeHost,
    port: null,
    selectedVersion,
    modelStatus,
    selectedModelId,
    modelMessage: message,
    message,
    healthUrl: "",
    logPath: getLogPath()
  });
};

const startHealthMonitor = () => {
  clearHealthMonitor();
  healthMonitor = setInterval(() => {
    if (healthCheckInProgress || currentState.status !== "running" || !managedProcess) {
      return;
    }

    healthCheckInProgress = true;
    void checkHealth().then(async (healthy) => {
      consecutiveHealthFailures = healthy ? 0 : consecutiveHealthFailures + 1;
      if (consecutiveHealthFailures < maximumHealthFailures || currentState.status !== "running") {
        return;
      }

      const failedState = snapshotState();
      const message = t("runtime.healthCheckFailed");
      await terminateManagedProcess("健康检查失败");
      await appendRuntimeLog(message);
      setState({
        ...failedState,
        status: "failed",
        port: null,
        pid: undefined,
        modelStatus: "load_failed",
        modelMessage: message,
        message,
        healthUrl: ""
      });
    }).finally(() => {
      healthCheckInProgress = false;
    });
  }, healthMonitorIntervalMs);
  healthMonitor.unref();
};

const performStart = async (): Promise<LlamaRuntimeProcessState> => {
  stopRequested = false;
  const runtimeSettings = await getLlamaRuntimeSettings();
  const selectedVersion = runtimeSettings.selectedVersion;
  const selectedRuntime = runtimeSettings.versions.find((version) => version.version === selectedVersion);
  const modelSettings = await getGgufModelSettings();
  const selectedModelId = modelSettings.selectedModelId;

  if (!selectedVersion || runtimeSettings.status !== "available" || !selectedRuntime) {
    return failStartup(
      selectedVersion,
      selectedModelId,
      runtimeSettings.message || t("runtime.selectAvailable")
    );
  }

  if (!selectedModelId || modelSettings.status === "unselected" || modelSettings.status === "selection_missing") {
    return failStartup(selectedVersion, selectedModelId, modelSettings.message || t("model.select"), "unselected");
  }
  if (modelSettings.status !== "ready") {
    return failStartup(selectedVersion, selectedModelId, modelSettings.message || t("model.mmprojMissing"), "unpaired");
  }

  let selectedModel;
  try {
    selectedModel = await getSelectedGgufModelRuntime();
  } catch (error) {
    return failStartup(
      selectedVersion,
      selectedModelId,
      error instanceof Error ? error.message : t("model.configurationUnavailable"),
      modelLoadStatusFromSettings(modelSettings.status)
    );
  }

  let nextPortOffset = 0;
  portAttempts: while (nextPortOffset < runtimePortCandidateCount) {
    const candidate = await findAvailableLlamaRuntimePort(nextPortOffset);
    if (!candidate) {
      break;
    }
    nextPortOffset = candidate.nextOffset;
    if (stopRequested) {
      return failStartup(selectedVersion, selectedModelId, t("runtime.cancelled"));
    }
    currentPort = candidate.port;
    const runtimePort = candidate.port;

  const args = [
    "--host",
    runtimeHost,
    "--port",
    String(runtimePort),
    "--parallel",
    "1",
    "--ctx-size",
    "8192",
    "--cache-ram",
    "0",
    "--alias",
    selectedModel.name,
    "-m",
    selectedModel.modelPath,
    "--mmproj",
    selectedModel.mmprojPath
  ];
  const command = [selectedRuntime.serverPath, ...args].map(quoteCommandArgument).join(" ");
  const startedAt = new Date().toISOString();

  setState({
    status: "starting",
    host: runtimeHost,
    port: runtimePort,
    selectedVersion,
    modelStatus: "loading",
    selectedModelId,
    loadedModelName: selectedModel.name,
    modelMessage: t("runtime.loadingModel"),
    startedAt,
    message: t("runtime.waitingForHealth"),
    healthUrl: getHealthUrl(),
    logPath: getLogPath()
  });
  await appendRuntimeLog(`启动时间：${startedAt}`);
  await appendRuntimeLog(`启动命令：${command}`);

  let spawnError = "";
  let spawnErrorCode = "";
  let processErrorOutput = "";
  let startupCompleted = false;
  const child = spawn(selectedRuntime.serverPath, args, {
    cwd: selectedRuntime.directoryPath,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  managedProcess = child;

  child.stdout?.on("data", (chunk: Buffer) => {
    void appendRuntimeLog(`[stdout] ${chunk.toString("utf8")}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    processErrorOutput = `${processErrorOutput}${text}`.slice(-10_000);
    void appendRuntimeLog(`[stderr] ${text}`);
  });
  child.once("error", (error) => {
    spawnError = error.message;
    spawnErrorCode = (error as NodeJS.ErrnoException).code ?? "";
    void appendRuntimeLog(`进程错误：${error.message}`);
  });
  child.once("exit", (code, signal) => {
    if (managedProcess !== child) {
      return;
    }
    managedProcess = null;
    clearHealthMonitor();
    void appendRuntimeLog(`进程退出：PID=${child.pid ?? "unknown"}，code=${code ?? "null"}，signal=${signal ?? "null"}`);
    if (!startupCompleted) {
      return;
    }
    currentPort = null;
    if (!stopRequested && currentState.status === "running") {
      const detail = summarizeProcessError(processErrorOutput);
      const message = detail
        ? t("runtime.unexpectedExitWithDetail", { code: code ?? t("common.unknown"), detail })
        : t("runtime.unexpectedExit", { code: code ?? t("common.unknown") });
      setState({
        ...snapshotState(),
        status: "failed",
        port: null,
        pid: undefined,
        modelStatus: "load_failed",
        modelMessage: message,
        message,
        healthUrl: ""
      });
    }
  });

  setState({
    ...snapshotState(),
    status: "starting",
    pid: child.pid,
    modelStatus: "loading",
    modelMessage: t("runtime.loadingModel"),
    message: t("runtime.waitingForHealth")
  });

  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (stopRequested) {
      return failStartup(selectedVersion, selectedModelId, t("runtime.cancelled"));
    }
    const startupErrorOutput = `${spawnErrorCode}\n${spawnError}\n${processErrorOutput}`;
    if (isPortBindingFailure(startupErrorOutput)) {
      await appendRuntimeLog(
        `端口绑定竞态失败：${runtimeHost}:${runtimePort}，code=${spawnErrorCode || "unknown"}，message=${summarizeProcessError(startupErrorOutput)}`
      );
      await terminatePortAttempt(child, "端口绑定竞态失败");
      continue portAttempts;
    }
    if (spawnError) {
      return failStartup(selectedVersion, selectedModelId, spawnError);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      const detail = summarizeProcessError(processErrorOutput);
      return failStartup(
        selectedVersion,
        selectedModelId,
        detail
          ? t("runtime.startupExitWithDetail", { code: child.exitCode ?? t("common.unknown"), detail })
          : t("runtime.startupExit", { code: child.exitCode ?? t("common.unknown") })
      );
    }
    if (await checkHealth()) {
      if (!(await isExpectedModelLoaded(selectedModel.name))) {
        return failStartup(selectedVersion, selectedModelId, t("runtime.modelNotReported"));
      }
      startupCompleted = true;
      const state = setState({
        status: "running",
        host: runtimeHost,
        port: runtimePort,
        selectedVersion,
        pid: child.pid,
        modelStatus: "loaded",
        selectedModelId,
        loadedModelName: selectedModel.name,
        modelMessage: t("runtime.modelLoaded"),
        startedAt,
        message: t("runtime.healthCheckPassed"),
        healthUrl: getHealthUrl(),
        logPath: getLogPath()
      });
      await appendRuntimeLog(`启动成功：PID=${child.pid ?? "unknown"}，健康检查=${getHealthUrl()}`);
      startHealthMonitor();
      return state;
    }
    await wait(healthPollIntervalMs);
  }

    if (isPortBindingFailure(processErrorOutput)) {
      await appendRuntimeLog(`端口绑定竞态失败：${runtimeHost}:${runtimePort}，stderr=${summarizeProcessError(processErrorOutput)}`);
      await terminatePortAttempt(child, "端口绑定竞态失败");
      continue portAttempts;
    }
    return failStartup(selectedVersion, selectedModelId, t("runtime.healthCheckTimeout", { seconds: startupTimeoutMs / 1_000 }));
  }

  return failStartup(selectedVersion, selectedModelId, t("runtime.noAvailablePort"));
};

export const getLlamaRuntimeProcessState = () => snapshotState();

export const syncIdleLlamaRuntimeSelectionState = async () => {
  if (managedProcess || startPromise || currentState.status === "starting" || currentState.status === "running") {
    return snapshotState();
  }

  const [runtimeSettings, modelSettings] = await Promise.all([
    getLlamaRuntimeSettings(),
    getGgufModelSettings()
  ]);
  return setState({
    status: "stopped",
    host: runtimeHost,
    port: null,
    selectedVersion: runtimeSettings.selectedVersion,
    modelStatus: modelLoadStatusFromSettings(modelSettings.status),
    selectedModelId: modelSettings.selectedModelId,
    modelMessage: modelSettings.selectedModelId
      ? modelSettings.message || t("runtime.modelSelectedNotLoaded")
      : t("runtime.modelUnselected"),
    message: t("runtime.serverStopped"),
    healthUrl: "",
    logPath: getLogPath()
  });
};

export const getReadyLlamaRuntimeConnection = async (): Promise<LlamaRuntimeConnection | null> => {
  const state = snapshotState();
  if (
    state.status !== "running"
    || state.modelStatus !== "loaded"
    || !state.loadedModelName
    || !managedProcess
    || currentPort === null
    || !(await checkHealth())
  ) {
    return null;
  }

  return {
    baseUrl: getBaseUrl(),
    modelName: state.loadedModelName
  };
};

export const startLlamaRuntime = async () => {
  if (currentState.status === "running" && managedProcess) {
    return snapshotState();
  }
  if (startPromise) {
    return startPromise;
  }

  startPromise = performStart().finally(() => {
    startPromise = null;
  });
  return startPromise;
};

export const stopLlamaRuntime = async (reason = "用户请求") => {
  stopRequested = true;
  const pendingStart = startPromise;
  await terminateManagedProcess(reason);
  if (pendingStart) {
    await pendingStart.catch(() => undefined);
  }
  await terminateManagedProcess(reason);
  const stoppedAt = new Date().toISOString();
  await appendRuntimeLog(`停止时间：${stoppedAt}`);
  return setState({
    status: "stopped",
    host: runtimeHost,
    port: null,
    selectedVersion: currentState.selectedVersion,
    modelStatus: currentState.selectedModelId ? "ready" : "unselected",
    selectedModelId: currentState.selectedModelId,
    loadedModelName: undefined,
    modelMessage: currentState.selectedModelId ? t("runtime.modelSelectedNotLoaded") : t("runtime.modelUnselected"),
    message: t("runtime.serverStopped"),
    healthUrl: "",
    logPath: getLogPath()
  });
};

export const hasManagedLlamaRuntimeProcess = () => managedProcess !== null || startPromise !== null;

export const registerLlamaRuntimeShutdownHandler = () => {
  if (shutdownHandlerRegistered) {
    return;
  }
  shutdownHandlerRegistered = true;

  app.on("before-quit", (event) => {
    if (allowAppQuit || !hasManagedLlamaRuntimeProcess()) {
      return;
    }

    event.preventDefault();
    void stopLlamaRuntime("软件退出").finally(() => {
      allowAppQuit = true;
      app.quit();
    });
  });
};

export const onLlamaRuntimeProcessStateChanged = (
  listener: (state: LlamaRuntimeProcessState) => void
) => {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
};
import { t } from "./localization";
