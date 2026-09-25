export const coreProtocolVersion = 1;
export const coreMaximumFrameBytes = 1024 * 1024;

export interface CoreErrorBody {
  code: string;
  stage: string;
  retryable: boolean;
  message: string;
}

export interface CoreResponseEnvelope<T = unknown> {
  protocolVersion: number;
  requestId: string;
  status: "success" | "error";
  catalogRevision: number;
  body: T | null;
  error: CoreErrorBody | null;
}

export interface CoreHelloBody {
  selectedProtocolVersion: number;
  serverName: string;
  serverProductVersion: string;
  serverProcessId: number;
  maximumFrameBytes: number;
  maximumPageSize: number;
  capabilities: string[];
  syntheticFixture: boolean;
}

export interface CoreCapabilityStatus {
  state: string;
  catalogSchemaVersion: number;
  pathStrategy: string;
  electronConnected: boolean;
  readsFileContent: boolean;
  writesSourceVolumes: boolean;
  usesNetwork: boolean;
}

export class CoreClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CoreClientError";
  }
}

export class CoreRemoteError extends Error {
  constructor(
    readonly code: string,
    readonly stage: string,
    readonly retryable: boolean
  ) {
    super(code);
    this.name = "CoreRemoteError";
  }
}
