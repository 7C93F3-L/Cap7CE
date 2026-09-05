const assert = require("node:assert/strict");
const { ShellWindowPresentationSizing } = require("../dist-electron/shellWindowPresentationSizing.js");
const { resolveRememberedWindowBounds } = require("../dist-electron/windowLayoutGeometry.js");

let titlebarHeight = 0;
const sizing = new ShellWindowPresentationSizing({
  getTitlebarHeight: () => titlebarHeight,
  capsuleWidth: 300,
  capsuleHeight: 34,
  microHeight: 156,
  miniHeight: 500,
  minimumWidth: 300,
  minimumHeight: 156,
  normalMinimumWidth: 950,
  normalMinimumHeight: 640,
  miniMaximumWidth: 520,
  microLayoutMaximumHeight: 300,
  edgeGap: 5,
  edgeAnchorThreshold: 12
});
const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1
};
const layoutManager = {
  resolveBounds: ({ defaultBounds }) => defaultBounds(display)
};

const cap7ceMicro = sizing.resolveBounds({ state: "micro", currentDisplay: display, displays: [display], layoutManager });
assert.deepEqual(cap7ceMicro, { x: 690, y: 879, width: 540, height: 156 });

titlebarHeight = 36;
const compatibilityMicro = sizing.resolveBounds({ state: "micro", currentDisplay: display, displays: [display], layoutManager });
assert.deepEqual(compatibilityMicro, { x: 690, y: 843, width: 540, height: 192 });
assert.equal(compatibilityMicro.y + compatibilityMicro.height, cap7ceMicro.y + cap7ceMicro.height);
assert.deepEqual(sizing.getContentBounds(compatibilityMicro), cap7ceMicro);
assert.deepEqual(sizing.getMinimumSize("micro", display.workArea), { width: 300, height: 192 });
assert.equal(sizing.isBottomCenterBounds(compatibilityMicro, display.workArea), true);

const rememberedNarrowBounds = { x: 1615, y: 120, width: 300, height: 800 };
const stableSizing = new ShellWindowPresentationSizing({
  getTitlebarHeight: () => 40,
  capsuleWidth: 300,
  capsuleHeight: 34,
  microHeight: 156,
  miniHeight: 500,
  minimumWidth: 300,
  minimumHeight: 156,
  normalMinimumWidth: 950,
  normalMinimumHeight: 640,
  miniMaximumWidth: 520,
  microLayoutMaximumHeight: 300,
  edgeGap: 5,
  edgeAnchorThreshold: 12,
  getNormalMinimumOuterSize: () => ({ width: 300, height: 170 })
});
const rememberedLayoutManager = {
  resolveBounds: ({ defaultBounds, minimumSize }) => resolveRememberedWindowBounds({
    defaultBounds: defaultBounds(display),
    profile: {
      expandedBounds: rememberedNarrowBounds,
      displayId: display.id,
      displayBoundsSnapshot: display.bounds,
      workAreaSnapshot: display.workArea,
      scaleFactor: display.scaleFactor,
      dockEdge: "right",
      updatedAt: "2026-09-06T00:00:00.000Z"
    },
    targetWorkArea: display.workArea,
    rememberLayout: true,
    minimumSize
  })
};
assert.deepEqual(stableSizing.resolveBounds({
  state: "normal",
  currentDisplay: display,
  displays: [display],
  layoutManager: rememberedLayoutManager
}), rememberedNarrowBounds);

console.log(JSON.stringify({
  cap7ceDimensionsUnchanged: true,
  compatibilityTitlebarAddedOutsideContent: true,
  bottomAnchorPreserved: true,
  compatibilityMinimumHeightConverted: true,
  stableNarrowNormalRestoreVerified: true
}));
