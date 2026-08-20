import { useCallback, useEffect, useState } from "react";
import type {
  GgufModelSettings,
  LlamaRuntimeProcessState,
  LlamaRuntimeSettings
} from "../../shared/types";

const emptyLlamaRuntimeSettings: LlamaRuntimeSettings = {
  versions: [],
  selectedVersion: "",
  status: "missing_root",
  runtimeRoot: "",
  configPath: ""
};

const emptyLlamaRuntimeProcessState: LlamaRuntimeProcessState = {
  status: "stopped",
  host: "127.0.0.1",
  port: null,
  selectedVersion: "",
  modelStatus: "unselected",
  selectedModelId: "",
  healthUrl: "",
  logPath: ""
};

const emptyGgufModelSettings: GgufModelSettings = {
  files: [],
  models: [],
  selectedModelId: "",
  status: "unselected",
  modelsRoot: "",
  configPath: ""
};

export const useRuntimeModelController = () => {
  const [llamaRuntimeSettings, setLlamaRuntimeSettings] = useState<LlamaRuntimeSettings>(emptyLlamaRuntimeSettings);
  const [llamaRuntimeProcessState, setLlamaRuntimeProcessState] = useState<LlamaRuntimeProcessState>(emptyLlamaRuntimeProcessState);
  const [ggufModelSettings, setGgufModelSettings] = useState<GgufModelSettings>(emptyGgufModelSettings);
  const [isLoadingLlamaRuntime, setIsLoadingLlamaRuntime] = useState(false);
  const [isLoadingGgufModels, setIsLoadingGgufModels] = useState(false);
  const [isChangingLlamaRuntimeState, setIsChangingLlamaRuntimeState] = useState(false);

  const refreshLlamaRuntimeSettings = useCallback(async () => {
    setIsLoadingLlamaRuntime(true);
    try {
      const [settings, processState] = await Promise.all([
        window.imageEverything?.llamaRuntime.settings(),
        window.imageEverything?.llamaRuntime.processState()
      ]);
      if (settings) setLlamaRuntimeSettings(settings);
      if (processState) setLlamaRuntimeProcessState(processState);
      return { settings: settings ?? null, processState: processState ?? null };
    } finally {
      setIsLoadingLlamaRuntime(false);
    }
  }, []);

  const refreshGgufModelSettings = useCallback(async () => {
    setIsLoadingGgufModels(true);
    try {
      const settings = await window.imageEverything?.ggufModels.settings();
      if (settings) setGgufModelSettings(settings);
      return settings ?? null;
    } finally {
      setIsLoadingGgufModels(false);
    }
  }, []);

  const updateSelectedLlamaRuntime = useCallback(async (version: string) => {
    const settings = await window.imageEverything?.llamaRuntime.updateSelected(version);
    if (settings) setLlamaRuntimeSettings(settings);
    return settings ?? null;
  }, []);

  const updateSelectedGgufModel = useCallback(async (modelId: string) => {
    const settings = await window.imageEverything?.ggufModels.updateSelected(modelId);
    if (settings) setGgufModelSettings(settings);
    return settings ?? null;
  }, []);

  const startLlamaRuntimeServer = useCallback(async () => {
    setIsChangingLlamaRuntimeState(true);
    try {
      const state = await window.imageEverything?.llamaRuntime.start();
      if (state) setLlamaRuntimeProcessState(state);
      return state ?? null;
    } finally {
      setIsChangingLlamaRuntimeState(false);
    }
  }, []);

  const stopLlamaRuntimeServer = useCallback(async () => {
    setIsChangingLlamaRuntimeState(true);
    try {
      const state = await window.imageEverything?.llamaRuntime.stop();
      if (state) setLlamaRuntimeProcessState(state);
      return state ?? null;
    } finally {
      setIsChangingLlamaRuntimeState(false);
    }
  }, []);

  useEffect(() => window.imageEverything?.llamaRuntime.onStatusChanged((state) => {
    setLlamaRuntimeProcessState(state);
  }), []);

  return {
    llamaRuntimeSettings,
    llamaRuntimeProcessState,
    ggufModelSettings,
    isLoadingLlamaRuntime,
    isLoadingGgufModels,
    isChangingLlamaRuntimeState,
    refreshLlamaRuntimeSettings,
    refreshGgufModelSettings,
    updateSelectedLlamaRuntime,
    updateSelectedGgufModel,
    startLlamaRuntimeServer,
    stopLlamaRuntimeServer
  };
};
