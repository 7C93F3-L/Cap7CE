const assert = require("node:assert/strict");
const {
  COMPATIBILITY_TITLEBAR_HEIGHT,
  DEFAULT_WINDOW_PRESENTATION_MODE,
  getWindowPresentationBrowserOptions,
  getWindowLayoutFileName,
  getWindowPresentationPolicy,
  normalizeWindowPresentationMode,
  resolveWindowPresentationTheme
} = require("../dist-electron/windowPresentationPolicy.js");

assert.equal(DEFAULT_WINDOW_PRESENTATION_MODE, "cap7ce");
assert.equal(normalizeWindowPresentationMode(undefined), "cap7ce");
assert.equal(normalizeWindowPresentationMode("invalid"), "cap7ce");
assert.equal(normalizeWindowPresentationMode("compatibility"), "compatibility");

const cap7cePolicy = getWindowPresentationPolicy();
assert.deepEqual(cap7cePolicy, {
  mode: "cap7ce",
  layoutFileName: "window-layout.json",
  titlebarHeight: 0,
  usesIndependentCapsuleWindow: false,
  surfaces: {
    main: { frame: false, transparent: true, usesWindowControlsOverlay: false },
    preview: { frame: false, transparent: true, usesWindowControlsOverlay: false }
  }
});

const compatibilityPolicy = getWindowPresentationPolicy("compatibility");
assert.equal(compatibilityPolicy.mode, "compatibility");
assert.equal(compatibilityPolicy.layoutFileName, "window-layout-compatibility.json");
assert.equal(compatibilityPolicy.titlebarHeight, COMPATIBILITY_TITLEBAR_HEIGHT);
assert.equal(compatibilityPolicy.usesIndependentCapsuleWindow, true);
assert.deepEqual(compatibilityPolicy.surfaces.main, {
  frame: false,
  transparent: false,
  usesWindowControlsOverlay: true
});
assert.deepEqual(compatibilityPolicy.surfaces.preview, compatibilityPolicy.surfaces.main);
assert.notEqual(getWindowLayoutFileName("cap7ce"), getWindowLayoutFileName("compatibility"));
assert.deepEqual(getWindowPresentationBrowserOptions(cap7cePolicy, "main", "dark"), {
  frame: false,
  transparent: true,
  backgroundColor: "#00000000"
});
assert.deepEqual(getWindowPresentationBrowserOptions(compatibilityPolicy, "main", "dark"), {
  frame: false,
  transparent: false,
  backgroundColor: "#171717",
  roundedCorners: true,
  titleBarStyle: "hidden",
  titleBarOverlay: { color: "#171717", symbolColor: "#D8D8D8", height: 36 }
});
assert.equal(resolveWindowPresentationTheme("system", true), "dark");
assert.equal(resolveWindowPresentationTheme("system", false), "light");
assert.equal(resolveWindowPresentationTheme("light", true), "light");

console.log(JSON.stringify({
  defaultModePreservesCap7CEWindowPolicy: true,
  invalidModesFallbackSafely: true,
  compatibilityCapabilitiesDeclaredReadOnly: true,
  presentationLayoutFilesSeparated: true,
  browserOptionsAndThemeResolved: true
}));
