export const WINDOW_PRESENTATION_MODES = ["cap7ce", "compatibility"] as const;

export type WindowPresentationMode = typeof WINDOW_PRESENTATION_MODES[number];
export type WindowPresentationSurface = "main" | "preview";

export interface WindowPresentationSurfacePolicy {
  frame: false;
  transparent: boolean;
  usesWindowControlsOverlay: boolean;
}

export interface WindowPresentationPolicy {
  mode: WindowPresentationMode;
  layoutFileName: string;
  titlebarHeight: number;
  usesIndependentCapsuleWindow: boolean;
  surfaces: Record<WindowPresentationSurface, WindowPresentationSurfacePolicy>;
}

export type WindowPresentationTheme = "light" | "dark";

export interface WindowPresentationBrowserOptions {
  frame: false;
  transparent: boolean;
  backgroundColor: string;
  roundedCorners?: true;
  titleBarStyle?: "hidden";
  titleBarOverlay?: {
    color: string;
    symbolColor: string;
    height: number;
  };
}

export const DEFAULT_WINDOW_PRESENTATION_MODE: WindowPresentationMode = "cap7ce";
export const COMPATIBILITY_TITLEBAR_HEIGHT = 36;

export const normalizeWindowPresentationMode = (value: unknown): WindowPresentationMode => (
  value === "compatibility" ? "compatibility" : DEFAULT_WINDOW_PRESENTATION_MODE
);

export const getWindowLayoutFileName = (mode: WindowPresentationMode) => (
  mode === "compatibility" ? "window-layout-compatibility.json" : "window-layout.json"
);

export const getWindowPresentationPolicy = (
  value: unknown = DEFAULT_WINDOW_PRESENTATION_MODE
): WindowPresentationPolicy => {
  const mode = normalizeWindowPresentationMode(value);
  const compatibility = mode === "compatibility";
  const surfacePolicy: WindowPresentationSurfacePolicy = {
    frame: false,
    transparent: !compatibility,
    usesWindowControlsOverlay: compatibility
  };
  return {
    mode,
    layoutFileName: getWindowLayoutFileName(mode),
    titlebarHeight: compatibility ? COMPATIBILITY_TITLEBAR_HEIGHT : 0,
    usesIndependentCapsuleWindow: compatibility,
    surfaces: {
      main: { ...surfacePolicy },
      preview: { ...surfacePolicy }
    }
  };
};

const windowPresentationThemes: Record<WindowPresentationTheme, { backgroundColor: string; symbolColor: string }> = {
  dark: { backgroundColor: "#171717", symbolColor: "#D8D8D8" },
  light: { backgroundColor: "#F4F4F4", symbolColor: "#242424" }
};

export const resolveWindowPresentationTheme = (
  preference: "system" | "light" | "dark",
  systemUsesDarkColors: boolean
): WindowPresentationTheme => (
  preference === "system" ? (systemUsesDarkColors ? "dark" : "light") : preference
);

export const getWindowPresentationBrowserOptions = (
  policy: WindowPresentationPolicy,
  surface: WindowPresentationSurface,
  theme: WindowPresentationTheme
): WindowPresentationBrowserOptions => {
  const surfacePolicy = policy.surfaces[surface];
  if (!surfacePolicy.usesWindowControlsOverlay) {
    return {
      frame: false,
      transparent: true,
      backgroundColor: "#00000000"
    };
  }
  const colors = windowPresentationThemes[theme];
  return {
    frame: false,
    transparent: false,
    backgroundColor: colors.backgroundColor,
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: colors.backgroundColor,
      symbolColor: colors.symbolColor,
      height: policy.titlebarHeight
    }
  };
};
