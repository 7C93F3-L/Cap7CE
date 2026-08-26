export type LlamaRuntimeStartSource = "manual" | "ai";

type IdleTimer = ReturnType<typeof setTimeout>;

export interface LlamaRuntimeIdleControllerOptions {
  idleTimeoutMs: number;
  onIdle: () => void | Promise<unknown>;
  schedule?: (callback: () => void, delayMs: number) => IdleTimer;
  cancel?: (timer: IdleTimer) => void;
}

export const createLlamaRuntimeIdleController = ({
  idleTimeoutMs,
  onIdle,
  schedule = setTimeout,
  cancel = clearTimeout
}: LlamaRuntimeIdleControllerOptions) => {
  let owner: "none" | LlamaRuntimeStartSource = "none";
  let activeAiUseCount = 0;
  let idleTimer: IdleTimer | null = null;

  const cancelIdleStop = () => {
    if (idleTimer === null) return;
    cancel(idleTimer);
    idleTimer = null;
  };

  const scheduleIdleStop = () => {
    cancelIdleStop();
    if (owner !== "ai" || activeAiUseCount > 0) return;
    idleTimer = schedule(() => {
      idleTimer = null;
      if (owner === "ai" && activeAiUseCount === 0) void onIdle();
    }, idleTimeoutMs);
    idleTimer.unref?.();
  };

  return {
    markStartRequested: (source: LlamaRuntimeStartSource) => {
      cancelIdleStop();
      if (source === "manual" || owner !== "manual") owner = source;
    },
    markStopped: () => {
      cancelIdleStop();
      owner = "none";
      activeAiUseCount = 0;
    },
    beginAiUse: () => {
      cancelIdleStop();
      activeAiUseCount += 1;
    },
    endAiUse: () => {
      activeAiUseCount = Math.max(0, activeAiUseCount - 1);
      scheduleIdleStop();
    },
    cancelIdleStop,
    getSnapshot: () => ({
      owner,
      activeAiUseCount,
      idleStopScheduled: idleTimer !== null
    })
  };
};
