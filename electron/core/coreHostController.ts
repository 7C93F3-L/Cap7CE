import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { CoreProtocolClient, type CorePendingRequest } from "./coreProtocolClient";
import {
  createCoreHostLaunchProfile, type CoreHostLaunchMode, waitForExit, withTimeout
} from "./coreHostLaunchProfile";
import { CoreCapabilityStatus, CoreClientError, coreProtocolVersion } from "./coreProtocolTypes";

const requiredCapabilities = [
  "capability.status", "volume.list", "volume.selection", "catalog.status",
  "catalog.build", "catalog.rebuild", "catalog.cancel", "catalog.resolveScope", "search.start",
  "search.nextPage", "search.cancel", "core.shutdown"
] as const;

export type CoreControllerState = "stopped" | "starting" | "ready" | "stopping" | "unavailable" | "failed";
export type CoreControllerReason =
  | "packaged-core-not-installed"
  | "core-host-missing"
  | "core-startup-failed"
  | "core-crash-restart-exhausted";

export interface CoreControllerSnapshot {
  state: CoreControllerState;
  reason?: CoreControllerReason;
  processId?: number;
  protocolVersion?: number;
  serverProductVersion?: string;
  restartCount: number;
}

export interface CoreControllerDiagnostics {
  log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void;
}

export interface CoreHostControllerOptions {
  packaged: boolean;
  executablePath?: string;
  productVersion: string;
  diagnostics?: CoreControllerDiagnostics;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  launchMode?: CoreHostLaunchMode;
}

interface ReadyMessage {
  status: string;
  protocolVersion: number;
  processId: number;
  syntheticFixture: boolean;
  catalogSchemaVersion: number | null;
}

export class CoreHostController {
  private state: CoreControllerState = "stopped";
  private reason: CoreControllerReason | undefined;
  private child: ChildProcessWithoutNullStreams | null = null;
  private client: CoreProtocolClient | null = null;
  private restartCount = 0;
  private desiredRunning = false;
  private stopping = false;
  private launchPromise: Promise<CoreControllerSnapshot> | null = null;
  private launchCleanup: (() => Promise<void>) | null = null;
  private serverProductVersion: string | undefined;

  constructor(private readonly options: CoreHostControllerOptions) {}

  snapshot(): CoreControllerSnapshot {
    return {
      state: this.state,
      reason: this.reason,
      processId: this.state === "ready" ? this.child?.pid : undefined,
      protocolVersion: this.state === "ready" ? coreProtocolVersion : undefined,
      serverProductVersion: this.state === "ready" ? this.serverProductVersion : undefined,
      restartCount: this.restartCount
    };
  }

  start(): Promise<CoreControllerSnapshot> {
    if (this.state === "ready") return Promise.resolve(this.snapshot());
    if (this.launchPromise) return this.launchPromise;
    return this.trackLaunch(this.startInitial());
  }

  private async startInitial(): Promise<CoreControllerSnapshot> {
    this.desiredRunning = true;
    this.stopping = false;
    this.restartCount = 0;
    if (this.options.packaged && (this.options.launchMode ?? "probe") === "probe") {
      return this.setUnavailable("packaged-core-not-installed");
    }
    if (!this.options.executablePath || !path.isAbsolute(this.options.executablePath)) {
      return this.setUnavailable("core-host-missing");
    }
    try {
      await access(this.options.executablePath);
    } catch {
      return this.setUnavailable("core-host-missing");
    }
    if (!this.desiredRunning || this.stopping) return this.snapshot();
    return this.runLaunch(false);
  }

  async readCapabilityStatus(): Promise<CoreCapabilityStatus> {
    if (this.state !== "ready" || !this.client) throw new CoreClientError("core-not-ready");
    return this.client.request<CoreCapabilityStatus>("capability.status", {}, 5_000);
  }

  request<T>(operation: string, body: Record<string, unknown>, deadlineMs?: number): Promise<T> {
    if (this.state !== "ready" || !this.client) throw new CoreClientError("core-not-ready");
    return this.client.request<T>(operation, body, deadlineMs);
  }
  supports(operation: string): boolean { return this.state === "ready" && Boolean(this.client?.supports(operation)); }

  startRequest<T>(operation: string, body: Record<string, unknown>, deadlineMs?: number): CorePendingRequest<T> {
    if (this.state !== "ready" || !this.client) throw new CoreClientError("core-not-ready");
    return this.client.startRequest<T>(operation, body, deadlineMs);
  }

  cancelRequest(requestId: string): Promise<boolean> {
    if (this.state !== "ready" || !this.client) throw new CoreClientError("core-not-ready");
    return this.client.cancel(requestId);
  }

  async stop(): Promise<CoreControllerSnapshot> {
    this.desiredRunning = false;
    this.stopping = true;
    this.state = "stopping";
    const inFlight = this.launchPromise;
    if (inFlight) await inFlight.catch(() => undefined);
    const child = this.child;
    const client = this.client;
    const cleanup = this.launchCleanup;
    if (client) {
      await client.request<{ accepted: boolean }>("core.shutdown", {}, 3_000).catch(() => undefined);
      client.close();
    }
    if (child && !(await withTimeout(waitForExit(child), this.options.stopTimeoutMs ?? 3_000))) {
      child.kill();
      await withTimeout(waitForExit(child), this.options.stopTimeoutMs ?? 3_000);
    }
    this.child = null;
    this.client = null;
    this.launchCleanup = null;
    if (cleanup) await cleanup();
    this.state = "stopped";
    this.reason = undefined;
    this.stopping = false;
    this.options.diagnostics?.log("info", "core.controller.stopped", { restartCount: this.restartCount });
    return this.snapshot();
  }

  private runLaunch(recovery: boolean): Promise<CoreControllerSnapshot> {
    return this.launch(recovery).catch(() => {
      this.state = "failed";
      this.reason = recovery ? "core-crash-restart-exhausted" : "core-startup-failed";
      this.options.diagnostics?.log("error", "core.controller.failed", {
        phase: recovery ? "recovery" : "startup",
        restartCount: this.restartCount
      });
      return this.snapshot();
    });
  }

  private trackLaunch(pending: Promise<CoreControllerSnapshot>): Promise<CoreControllerSnapshot> {
    this.launchPromise = pending;
    void pending.finally(() => {
      if (this.launchPromise === pending) this.launchPromise = null;
    });
    return pending;
  }

  private async launch(recovery: boolean): Promise<CoreControllerSnapshot> {
    const executablePath = this.options.executablePath!;
    this.state = "starting";
    this.reason = undefined;
    const startedAt = Date.now();
    const token = randomBytes(16).toString("hex");
    const profile = createCoreHostLaunchProfile(this.options.launchMode ?? "probe", token);
    const pipeName = profile.pipeName;
    const sessionSecret = randomBytes(32).toString("base64");
    this.options.diagnostics?.log("info", "core.controller.starting", {
      phase: recovery ? "recovery" : "startup",
      restartCount: this.restartCount
    });
    const child = spawn(executablePath, profile.arguments, {
      cwd: path.dirname(executablePath),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    child.stderr.resume();
    child.stdin.end(`${sessionSecret}\n`, "utf8");
    try {
      const ready = await this.readReadyMessage(child, this.options.startupTimeoutMs ?? 10_000);
      if (!child.pid || ready.status !== "ready" || ready.processId !== child.pid
        || ready.protocolVersion !== coreProtocolVersion || ready.syntheticFixture
        || ready.catalogSchemaVersion !== 2) {
        throw new CoreClientError("invalid-ready-message");
      }
      const client = await CoreProtocolClient.connect({
        pipeName,
        sessionSecret,
        expectedServerProcessId: child.pid,
        expectedSyntheticFixture: false,
        requiredCapabilities,
        clientProductVersion: this.options.productVersion
      });
      if (!this.desiredRunning || this.stopping || child.exitCode !== null) {
        client.close();
        throw new CoreClientError("startup-cancelled");
      }
      this.child = child;
      this.client = client;
      this.launchCleanup = profile.cleanup;
      this.state = "ready";
      this.serverProductVersion = this.options.productVersion;
      child.once("exit", () => this.handleUnexpectedExit(child));
      this.options.diagnostics?.log("info", "core.controller.ready", {
        durationMs: Date.now() - startedAt,
        restartCount: this.restartCount
      });
      return this.snapshot();
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await withTimeout(waitForExit(child), this.options.stopTimeoutMs ?? 3_000);
      await profile.cleanup();
      throw error;
    }
  }

  private handleUnexpectedExit(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.client?.close();
    this.child = null;
    this.client = null;
    const cleanup = this.launchCleanup;
    this.launchCleanup = null;
    if (cleanup) void cleanup();
    if (this.stopping || !this.desiredRunning) return;
    if (this.restartCount >= 1) {
      this.state = "failed";
      this.reason = "core-crash-restart-exhausted";
      this.options.diagnostics?.log("error", "core.controller.crash_exhausted", { restartCount: this.restartCount });
      return;
    }
    this.restartCount += 1;
    this.options.diagnostics?.log("warn", "core.controller.restarting", { restartCount: this.restartCount });
    void this.trackLaunch(this.runLaunch(true));
  }

  private readReadyMessage(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<ReadyMessage> {
    return new Promise((resolve, reject) => {
      let buffered = Buffer.alloc(0);
      const finish = (error?: Error, value?: ReadyMessage) => {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stdout.off("end", onEnd);
        child.off("error", onError);
        child.off("exit", onExit);
        error ? reject(error) : resolve(value!);
      };
      const onData = (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        if (buffered.length > 4_096) return finish(new CoreClientError("ready-message-too-large"));
        const newline = buffered.indexOf(10);
        if (newline < 0) return;
        try {
          finish(undefined, JSON.parse(buffered.subarray(0, newline).toString("utf8")) as ReadyMessage);
        } catch {
          finish(new CoreClientError("invalid-ready-message"));
        }
      };
      const onEnd = () => finish(new CoreClientError("core-ended-before-ready"));
      const onError = () => finish(new CoreClientError("core-spawn-failed"));
      const onExit = () => finish(new CoreClientError("core-ended-before-ready"));
      const timer = setTimeout(() => finish(new CoreClientError("core-ready-timeout")), timeoutMs);
      child.stdout.on("data", onData);
      child.stdout.once("end", onEnd);
      child.once("error", onError);
      child.once("exit", onExit);
    });
  }

  private setUnavailable(reason: CoreControllerReason): CoreControllerSnapshot {
    this.desiredRunning = false;
    this.state = "unavailable";
    this.reason = reason;
    this.options.diagnostics?.log("warn", "core.controller.unavailable", { reason });
    return this.snapshot();
  }
}
