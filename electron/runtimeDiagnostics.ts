import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimeDiagnosticsInfo {
  logDirectory: string;
  crashDirectory: string;
  runtimeLogPath: string;
  detailedLoggingEnabled: boolean;
}

export type RuntimeDiagnosticLevel = "info" | "warn" | "error";
export type RuntimeDiagnosticData = Record<string, unknown>;

export interface RuntimeDiagnosticOperation {
  complete(data?: RuntimeDiagnosticData): void;
  fail(error: unknown, data?: RuntimeDiagnosticData): void;
}

export interface RuntimeDiagnosticsOptions {
  userDataPath: string;
  maxLogBytes?: number;
  retainedLogFiles?: number;
  now?: () => Date;
}

const defaultMaxLogBytes = 2 * 1024 * 1024;
const defaultRetainedLogFiles = 5;
const maximumStringLength = 2_000;

export const redactDiagnosticText = (value: string): string => value
  .replace(/\\\\[^\\\s]+\\[^\s"']+/g, "<network-path>")
  .replace(/[A-Za-z]:\\[^\r\n"']+/g, "<local-path>")
  .replace(/file:\/\/\/[^\s"']+/gi, "<file-url>");

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "<truncated>";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactDiagnosticText(value).slice(0, maximumStringLength);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactDiagnosticText(value.message).slice(0, maximumStringLength),
      stack: value.stack ? redactDiagnosticText(value.stack).slice(0, maximumStringLength) : undefined
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]));
  }
  return String(value);
};

const resourceSnapshot = () => {
  const memory = process.memoryUsage();
  return {
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    externalMb: Math.round(memory.external / 1024 / 1024),
    systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
    systemTotalMb: Math.round(os.totalmem() / 1024 / 1024)
  };
};

export class RuntimeDiagnostics {
  readonly logDirectory: string;
  readonly crashDirectory: string;
  readonly runtimeLogPath: string;
  readonly activeSessionPath: string;

  private readonly maxLogBytes: number;
  private readonly retainedLogFiles: number;
  private readonly now: () => Date;
  private readonly sessionId = randomUUID();
  private sequence = 0;
  private detailedLoggingEnabled = false;
  private writeQueue = Promise.resolve();
  private initialization: Promise<void> | null = null;

  constructor(options: RuntimeDiagnosticsOptions) {
    this.logDirectory = path.join(options.userDataPath, "logs");
    this.crashDirectory = path.join(options.userDataPath, "Crashpad");
    this.runtimeLogPath = path.join(this.logDirectory, "cap7ce-runtime.jsonl");
    this.activeSessionPath = path.join(this.logDirectory, ".active-session.json");
    this.maxLogBytes = options.maxLogBytes ?? defaultMaxLogBytes;
    this.retainedLogFiles = options.retainedLogFiles ?? defaultRetainedLogFiles;
    this.now = options.now ?? (() => new Date());
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.initializeInternal();
    return this.initialization;
  }

  private async initializeInternal(): Promise<void> {
    await Promise.all([
      mkdir(this.logDirectory, { recursive: true }),
      mkdir(this.crashDirectory, { recursive: true })
    ]);
    const previousSession = await readFile(this.activeSessionPath, "utf8").catch(() => "");
    if (previousSession) {
      await this.appendEntry("warn", "session.unclean_exit", {
        previousSession: sanitizeValue(previousSession)
      });
    }
    await writeFile(this.activeSessionPath, JSON.stringify({
      sessionId: this.sessionId,
      startedAt: this.now().toISOString(),
      pid: process.pid
    }), "utf8");
    await this.appendEntry("info", "session.started", {
      platform: process.platform,
      arch: process.arch,
      resources: resourceSnapshot()
    });
  }

  getInfo(): RuntimeDiagnosticsInfo {
    return {
      logDirectory: this.logDirectory,
      crashDirectory: this.crashDirectory,
      runtimeLogPath: this.runtimeLogPath,
      detailedLoggingEnabled: this.detailedLoggingEnabled
    };
  }

  setDetailedLoggingEnabled(enabled: boolean): RuntimeDiagnosticsInfo {
    this.detailedLoggingEnabled = enabled;
    this.log("info", "diagnostics.detail_changed", { enabled });
    return this.getInfo();
  }

  log(level: RuntimeDiagnosticLevel, event: string, data: RuntimeDiagnosticData = {}): void {
    this.enqueue(level, event, data);
  }

  logDetailed(event: string, data: RuntimeDiagnosticData = {}): void {
    if (!this.detailedLoggingEnabled) return;
    this.enqueue("info", event, data);
  }

  startOperation(event: string, data: RuntimeDiagnosticData = {}): RuntimeDiagnosticOperation {
    const startedAt = Date.now();
    this.log("info", `${event}.started`, {
      ...data,
      resources: resourceSnapshot()
    });
    return {
      complete: (completionData = {}) => this.log("info", `${event}.completed`, {
        ...completionData,
        durationMs: Date.now() - startedAt,
        resources: resourceSnapshot()
      }),
      fail: (error, failureData = {}) => this.log("error", `${event}.failed`, {
        ...failureData,
        durationMs: Date.now() - startedAt,
        error,
        resources: resourceSnapshot()
      })
    };
  }

  async flush(): Promise<void> {
    await this.initialize();
    await this.writeQueue;
  }

  markCleanExitSync(): void {
    try {
      mkdirSync(this.logDirectory, { recursive: true });
      appendFileSync(this.runtimeLogPath, `${this.serializeEntry("info", "session.ended", {})}\n`, "utf8");
      rmSync(this.activeSessionPath, { force: true });
    } catch {
      // Diagnostics must never block application shutdown.
    }
  }

  private enqueue(level: RuntimeDiagnosticLevel, event: string, data: RuntimeDiagnosticData): void {
    this.writeQueue = this.writeQueue
      .then(() => this.initialize())
      .then(() => this.appendEntry(level, event, data))
      .catch(() => undefined);
  }

  private serializeEntry(level: RuntimeDiagnosticLevel, event: string, data: RuntimeDiagnosticData): string {
    return JSON.stringify({
      timestamp: this.now().toISOString(),
      sessionId: this.sessionId,
      sequence: ++this.sequence,
      level,
      event: event.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100),
      data: sanitizeValue(data)
    });
  }

  private async appendEntry(level: RuntimeDiagnosticLevel, event: string, data: RuntimeDiagnosticData): Promise<void> {
    await mkdir(this.logDirectory, { recursive: true });
    await this.rotateIfNeeded();
    await appendFile(this.runtimeLogPath, `${this.serializeEntry(level, event, data)}\n`, "utf8");
  }

  private async rotateIfNeeded(): Promise<void> {
    const current = await stat(this.runtimeLogPath).catch(() => null);
    if (!current || current.size < this.maxLogBytes) return;
    await rm(`${this.runtimeLogPath}.${this.retainedLogFiles}`, { force: true });
    for (let index = this.retainedLogFiles - 1; index >= 1; index -= 1) {
      await rename(`${this.runtimeLogPath}.${index}`, `${this.runtimeLogPath}.${index + 1}`).catch(() => undefined);
    }
    await rename(this.runtimeLogPath, `${this.runtimeLogPath}.1`).catch(() => undefined);
  }
}
