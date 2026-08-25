import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface RuntimeProcessState {
  status: string;
}

export interface RuntimeModelIpcDependencies {
  registrar: IpcRegistrar;
  getRuntimeSettings: () => unknown;
  updateSelectedRuntime: (selectedVersion: string) => Promise<unknown>;
  getRuntimeProcessState: () => RuntimeProcessState;
  startRuntime: () => unknown;
  stopRuntime: () => unknown;
  getModelSettings: () => unknown;
  updateSelectedModel: (selectedModelId: string) => Promise<unknown>;
  syncIdleSelectionState: () => Promise<unknown>;
  translateRuntimeSwitchBlocked: () => string;
  translateModelSwitchBlocked: () => string;
}

const isRuntimeActive = (state: RuntimeProcessState): boolean => (
  state.status === "starting" || state.status === "running"
);

export const registerRuntimeModelIpc = ({
  registrar,
  getRuntimeSettings,
  updateSelectedRuntime,
  getRuntimeProcessState,
  startRuntime,
  stopRuntime,
  getModelSettings,
  updateSelectedModel,
  syncIdleSelectionState,
  translateRuntimeSwitchBlocked,
  translateModelSwitchBlocked
}: RuntimeModelIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "llamaRuntime:settings",
        listener: () => getRuntimeSettings()
      },
      {
        kind: "handle",
        channel: "llamaRuntime:updateSelected",
        listener: async (_event, selectedVersion: string) => {
          if (isRuntimeActive(getRuntimeProcessState())) {
            throw new Error(translateRuntimeSwitchBlocked());
          }
          const settings = await updateSelectedRuntime(selectedVersion);
          await syncIdleSelectionState();
          return settings;
        }
      },
      {
        kind: "handle",
        channel: "llamaRuntime:processState",
        listener: () => getRuntimeProcessState()
      },
      {
        kind: "handle",
        channel: "llamaRuntime:start",
        listener: () => startRuntime()
      },
      {
        kind: "handle",
        channel: "llamaRuntime:stop",
        listener: () => stopRuntime()
      },
      {
        kind: "handle",
        channel: "ggufModels:settings",
        listener: () => getModelSettings()
      },
      {
        kind: "handle",
        channel: "ggufModels:updateSelected",
        listener: async (_event, selectedModelId: string) => {
          if (isRuntimeActive(getRuntimeProcessState())) {
            throw new Error(translateModelSwitchBlocked());
          }
          const settings = await updateSelectedModel(selectedModelId);
          await syncIdleSelectionState();
          return settings;
        }
      }
    ]
  });
};
