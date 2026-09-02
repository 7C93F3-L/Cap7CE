export const WINDOW_PRESENTATION_MODES = ["stable", "cap7ce", "compatibility"] as const;

export type WindowPresentationMode = typeof WINDOW_PRESENTATION_MODES[number];
export type WindowPresentationSurface = "main" | "preview" | "settings";

export interface WindowPresentationSurfacePolicy {
  frame: boolean;
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
  frame: boolean;
  transparent: boolean;
  backgroundColor: string;
  backgroundMaterial?: "mica" | "acrylic";
  roundedCorners?: true;
  titleBarStyle?: "hidden";
  titleBarOverlay?: {
    color: string;
    symbolColor: string;
    height: number;
  };
}

export const DEFAULT_WINDOW_PRESENTATION_MODE: WindowPresentationMode = "stable";
export const STABLE_TITLEBAR_HEIGHT = 40;
export const COMPATIBILITY_TITLEBAR_HEIGHT = 36;

export const normalizeWindowPresentationMode = (value: unknown): WindowPresentationMode => (
  value === "stable" || value === "cap7ce" || value === "compatibility"
    ? value
    : DEFAULT_WINDOW_PRESENTATION_MODE
);

export const getWindowLayoutFileName = (mode: WindowPresentationMode) => (
  mode === "stable"
    ? "window-layout-stable-ui.json"
    : mode === "compatibility"
      ? "window-layout-compatibility.json"
      : "window-layout.json"
);

export const isStableWindowPresentationMode = (mode: WindowPresentationMode) => mode === "stable";

export const getWindowPresentationPolicy = (
  value: unknown = DEFAULT_WINDOW_PRESENTATION_MODE
): WindowPresentationPolicy => {
  const mode = normalizeWindowPresentationMode(value);
  const stable = isStableWindowPresentationMode(mode);
  const compatibility = mode === "compatibility";
  const surfacePolicy: WindowPresentationSurfacePolicy = {
    frame: false,
    transparent: !stable && !compatibility,
    usesWindowControlsOverlay: stable || compatibility
  };
  return {
    mode,
    layoutFileName: getWindowLayoutFileName(mode),
    titlebarHeight: stable ? STABLE_TITLEBAR_HEIGHT : compatibility ? COMPATIBILITY_TITLEBAR_HEIGHT : 0,
    usesIndependentCapsuleWindow: compatibility,
    surfaces: {
      main: { ...surfacePolicy },
      preview: { ...surfacePolicy },
      settings: { ...surfacePolicy }
    }
  };
};

const windowPresentationThemes: Record<WindowPresentationTheme, { symbolColor: string }> = {
  dark: { symbolColor: "#D8D8D8" },
  light: { symbolColor: "#242424" }
};

export const getWindowPresentationSymbolColor = (theme: WindowPresentationTheme) => (
  windowPresentationThemes[theme].symbolColor
);

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
  return {
    frame: false,
    transparent: false,
    backgroundColor: "#00000000",
    backgroundMaterial: "mica",
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: getWindowPresentationSymbolColor(theme),
      height: policy.titlebarHeight
    }
  };
};
