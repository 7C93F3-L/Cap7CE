import { randomBytes } from "node:crypto";
import net from "node:net";
import {
  CoreClientError,
  CoreHelloBody,
  CoreRemoteError,
  CoreResponseEnvelope,
  coreMaximumFrameBytes,
  coreProtocolVersion
} from "./coreProtocolTypes";

interface CoreProtocolClientOptions {
  pipeName: string;
  sessionSecret: string;
  expectedServerProcessId: number;
  expectedSyntheticFixture: boolean;
  requiredCapabilities: readonly string[];
  clientProductVersion: string;
  connectTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (response: CoreResponseEnvelope) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface CorePendingRequest<T> {
  requestId: string;
  response: Promise<T>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class CoreProtocolClient {
  private readonly pending = new Map<string, PendingRequest>();
  private receiveBuffer = Buffer.alloc(0);
  private sequence = 0;
  private closed = false;

  private constructor(private readonly socket: net.Socket) {
    socket.on("data", (chunk) => this.consume(chunk));
    socket.on("error", () => this.failAll(new CoreClientError("transport-error")));
    socket.on("close", () => this.failAll(new CoreClientError("transport-closed")));
  }

  static async connect(options: CoreProtocolClientOptions): Promise<CoreProtocolClient> {
    const socket = net.createConnection(`\\\\.\\pipe\\${options.pipeName}`);
    const client = new CoreProtocolClient(socket);
    try {
      await client.waitForConnection(options.connectTimeoutMs ?? 5_000);
      const hello = await client.request<CoreHelloBody>("session.hello", {
        sessionSecret: options.sessionSecret,
        supportedProtocolVersions: [coreProtocolVersion],
        clientName: "Cap7CE Electron Core Controller",
        clientProductVersion: options.clientProductVersion,
        clientProcessId: process.pid
      }, 5_000);
      client.validateHello(hello, options);
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  startRequest<T>(operation: string, body: Record<string, unknown>, deadlineMs = 5_000): CorePendingRequest<T> {
    if (this.closed) throw new CoreClientError("transport-closed");
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 120_000) {
      throw new CoreClientError("invalid-deadline");
    }
    const requestId = `shell-${++this.sequence}-${randomBytes(4).toString("hex")}`;
    const frame = this.encodeFrame({ protocolVersion: coreProtocolVersion, requestId, operation, deadlineMs, body });
    const response = new Promise<CoreResponseEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new CoreClientError("request-timeout"));
      }, deadlineMs + 1_000);
      this.pending.set(requestId, { resolve, reject, timer });
    }).then((envelope) => {
      if (envelope.status === "error") {
        const error = envelope.error;
        throw new CoreRemoteError(error?.code ?? "invalid-error", error?.stage ?? "unknown", error?.retryable ?? false);
      }
      if (envelope.body === null) throw new CoreClientError("missing-response-body");
      return envelope.body as T;
    });
    this.socket.write(frame);
    return { requestId, response };
  }

  request<T>(operation: string, body: Record<string, unknown>, deadlineMs = 5_000): Promise<T> {
    return this.startRequest<T>(operation, body, deadlineMs).response;
  }

  async cancel(targetRequestId: string): Promise<boolean> {
    const result = await this.request<{ accepted: boolean }>("search.cancel", { targetRequestId });
    return result.accepted === true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.end();
    this.socket.destroy();
    this.failAll(new CoreClientError("transport-closed"));
  }

  private waitForConnection(timeoutMs: number): Promise<void> {
    if (this.socket.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new CoreClientError("connect-timeout")), timeoutMs);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.socket.off("connect", onConnect);
        this.socket.off("error", onError);
        error ? reject(error) : resolve();
      };
      const onConnect = () => finish();
      const onError = () => finish(new CoreClientError("connect-failed"));
      this.socket.once("connect", onConnect);
      this.socket.once("error", onError);
    });
  }

  private validateHello(body: CoreHelloBody, options: CoreProtocolClientOptions): void {
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
    if (body.selectedProtocolVersion !== coreProtocolVersion
      || body.serverName !== "Cap7CE.Core.Host"
      || body.serverProductVersion !== options.clientProductVersion
      || body.serverProcessId !== options.expectedServerProcessId
      || body.maximumFrameBytes !== coreMaximumFrameBytes
      || body.maximumPageSize !== 200
      || body.syntheticFixture !== options.expectedSyntheticFixture
      || options.requiredCapabilities.some((capability) => !capabilities.includes(capability))) {
      this.close();
      throw new CoreClientError("handshake-mismatch");
    }
  }

  private encodeFrame(value: unknown): Buffer {
    const payload = Buffer.from(JSON.stringify(value), "utf8");
    if (payload.length > coreMaximumFrameBytes) throw new CoreClientError("message-too-large");
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32LE(payload.length, 0);
    payload.copy(frame, 4);
    return frame;
  }

  private consume(chunk: Buffer): void {
    if (this.closed) return;
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    while (this.receiveBuffer.length >= 4) {
      const length = this.receiveBuffer.readUInt32LE(0);
      if (length > coreMaximumFrameBytes) {
        this.close();
        return;
      }
      if (this.receiveBuffer.length < length + 4) return;
      const payload = this.receiveBuffer.subarray(4, length + 4);
      this.receiveBuffer = this.receiveBuffer.subarray(length + 4);
      this.consumeResponse(payload);
    }
  }

  private consumeResponse(payload: Buffer): void {
    let value: unknown;
    try {
      value = JSON.parse(payload.toString("utf8"));
    } catch {
      this.close();
      return;
    }
    if (!isRecord(value) || typeof value.requestId !== "string" || !this.pending.has(value.requestId)) return;
    const request = this.pending.get(value.requestId)!;
    this.pending.delete(value.requestId);
    clearTimeout(request.timer);
    if (value.protocolVersion !== coreProtocolVersion
      || (value.status !== "success" && value.status !== "error")) {
      request.reject(new CoreClientError("invalid-response"));
      return;
    }
    request.resolve(value as unknown as CoreResponseEnvelope);
  }

  private failAll(error: Error): void {
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
