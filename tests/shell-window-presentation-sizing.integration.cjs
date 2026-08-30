const assert = require("node:assert/strict");
const { ShellWindowPresentationSizing } = require("../dist-electron/shellWindowPresentationSizing.js");

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

console.log(JSON.stringify({
  cap7ceDimensionsUnchanged: true,
  compatibilityTitlebarAddedOutsideContent: true,
  bottomAnchorPreserved: true,
  compatibilityMinimumHeightConverted: true
}));
