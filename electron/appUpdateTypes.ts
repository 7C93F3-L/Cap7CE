export type AppUpdateDownloadErrorCode = "cancelled" | "rate_limited" | "network" | "disk_space" | "security" | "incomplete" | "invalid" | "unknown";
export type AppUpdateDownloadPhase = "downloading" | "verifying" | "ready";

export interface AppUpdateDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
  phase: AppUpdateDownloadPhase;
}

export interface AppUpdatePublicState {
  status: "idle" | "resumable" | "ready" | "downloading" | "verifying";
  version?: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
}

export interface AppUpdateCheckResponse {
  status: "up_to_date" | "update_available" | "failed";
  currentVersion: string;
  latestVersion?: string;
  downloadState: AppUpdatePublicState;
}

export type AppUpdateActionResponse = Omit<AppUpdatePublicState, "status"> & {
  status: AppUpdatePublicState["status"] | "paused" | "busy" | "unsupported" | "installing" | "failed";
  reason?: AppUpdateDownloadErrorCode;
};
