import type { WindowPresentationMode } from "./windowPresentationPolicy";

export interface StableUiDevelopmentOptions {
  enabled: boolean;
}

export const resolveStableUiDevelopmentOptions = ({
  devServerUrl,
  rendererFlag,
  windowPresentationMode
}: {
  devServerUrl: string | undefined;
  rendererFlag: string | undefined;
  windowPresentationMode: WindowPresentationMode;
}): StableUiDevelopmentOptions => ({
  enabled: Boolean(devServerUrl && rendererFlag === "1" && windowPresentationMode === "compatibility")
});

export const resolveStableUiLayoutFileName = (
  defaultFileName: string,
  options: StableUiDevelopmentOptions
) => options.enabled ? "window-layout-stable-ui-development.json" : defaultFileName;

export const applyStableUiAlwaysOnTopPreference = async (
  requestedEnabled: boolean,
  options: StableUiDevelopmentOptions,
  persist: (enabled: boolean) => Promise<{ alwaysOnTop: boolean }>
) => options.enabled ? requestedEnabled : (await persist(requestedEnabled)).alwaysOnTop;

const resolveCurrentStableUiDevelopmentOptions = (windowPresentationMode: WindowPresentationMode) => (
  resolveStableUiDevelopmentOptions({
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
    rendererFlag: process.env.CAP7CE_STABLE_UI,
    windowPresentationMode
  })
);

export const isCurrentStableUiDevelopmentEnabled = (windowPresentationMode: WindowPresentationMode) => (
  resolveCurrentStableUiDevelopmentOptions(windowPresentationMode).enabled
);

export const getStableUiDevelopmentLayoutFileName = (
  defaultFileName: string,
  windowPresentationMode: WindowPresentationMode
) => resolveStableUiLayoutFileName(defaultFileName, resolveCurrentStableUiDevelopmentOptions(windowPresentationMode));

export const applyCurrentStableUiAlwaysOnTopPreference = (
  requestedEnabled: boolean,
  windowPresentationMode: WindowPresentationMode,
  persist: (enabled: boolean) => Promise<{ alwaysOnTop: boolean }>
) => applyStableUiAlwaysOnTopPreference(requestedEnabled, resolveCurrentStableUiDevelopmentOptions(windowPresentationMode), persist);

export const applyStableUiDevelopmentQuery = (url: URL, options: StableUiDevelopmentOptions) => {
  if (!options.enabled) return url;
  url.searchParams.set("ui", "stable");
  return url;
};

export const applyCurrentStableUiDevelopmentQuery = (
  url: URL,
  windowPresentationMode: WindowPresentationMode
) => applyStableUiDevelopmentQuery(url, resolveCurrentStableUiDevelopmentOptions(windowPresentationMode));
