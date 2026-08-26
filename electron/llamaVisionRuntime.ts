import { getReadyLlamaRuntimeConnection, startLlamaRuntime } from "./llamaRuntimeManager";
import { t } from "./localization";

export const ensureLlamaVisionRuntimeConnection = async () => {
  const existingConnection = await getReadyLlamaRuntimeConnection();
  if (existingConnection) return existingConnection;

  const state = await startLlamaRuntime("ai");
  if (state.status !== "running" || state.modelStatus !== "loaded") {
    throw new Error(state.modelMessage || state.message || t("runtime.visionStartupFailed"));
  }

  const connection = await getReadyLlamaRuntimeConnection();
  if (!connection) {
    throw new Error(t("runtime.visionUnavailable"));
  }
  return connection;
};
