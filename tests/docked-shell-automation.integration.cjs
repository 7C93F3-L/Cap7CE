const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DockedShellController,
  dockedShellDockThresholdPx,
  dockedShellPeekThicknessPx,
  dockedShellRevealThicknessPx
} = require("../dist-electron/dockedShellController.js");
const { WindowLayerController } = require("../dist-electron/windowLayerController.js");

const bottomTaskbarDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1
};
const topTaskbarDisplay = {
  ...bottomTaskbarDisplay,
  workArea: { x: 0, y: 40, width: 1920, height: 1040 }
};

const createController = ({ initialBounds, display = bottomTaskbarDisplay, enabled = true, fixed = false, shellState = "normal", collapsibleStates, isDockEdgeExposed }) => {
  let bounds = { ...initialBounds };
  let activeDisplay = display;
  let clock = 0;
  const presentation = { shadow: true };
  const activity = { collapsedLayers: [], focus: 0, hideLine: 0, markProgrammaticMove: 0, markProgrammaticResize: 0, moveTop: 0 };
  const cursor = { x: bounds.x + 20, y: bounds.y + 20 };
  const context = { state: shellState, maximized: false, interactionBlocked: false };
  const appliedBounds = [];
  const window = {
    focus: () => { activity.focus += 1; },
    getBounds: () => ({ ...bounds }),
    hasShadow: () => presentation.shadow,
    isDestroyed: () => false,
    isVisible: () => true,
    moveTop: () => { activity.moveTop += 1; },
    setBounds: (nextBounds, animate) => {
      bounds = { ...nextBounds };
      appliedBounds.push({ bounds: { ...nextBounds }, animate });
    },
    setHasShadow: (value) => { presentation.shadow = value; }
  };
  const controller = new DockedShellController({
    window,
    collapsibleStates,
    enabled,
    fixed,
    getCursorPoint: () => ({ ...cursor }),
    getDisplay: () => activeDisplay,
    getShellContext: () => ({ ...context }),
    hideLine: () => { activity.hideLine += 1; },
    isDockEdgeExposed,
    markProgrammaticMove: () => { activity.markProgrammaticMove += 1; },
    markProgrammaticResize: () => { activity.markProgrammaticResize += 1; },
    setCollapsedLayerActive: (active) => { activity.collapsedLayers.push(active); },
    now: () => clock
  });
  const sample = (point, now) => {
    cursor.x = point.x;
    cursor.y = point.y;
    clock = now;
    controller.sampleCursor(point, now);
  };
  return { activity, appliedBounds, context, controller, getBounds: () => ({ ...bounds }), presentation, sample, setBounds: (nextBounds) => { bounds = { ...nextBounds }; }, setDisplay: (nextDisplay) => { activeDisplay = nextDisplay; } };
};

assert.equal(dockedShellDockThresholdPx, 40);
assert.equal(dockedShellPeekThicknessPx, 5);
assert.equal(dockedShellRevealThicknessPx, 2);

const leftBounds = { x: 0, y: 200, width: 900, height: 600 };
const left = createController({ initialBounds: leftBounds });
assert.deepEqual(left.controller.toggle(), { status: "collapsed", edge: "left" });
assert.equal(left.controller.hasActiveSession(), true);
assert.deepEqual(left.getBounds(), { ...leftBounds, x: -895 });
assert.equal(left.appliedBounds.at(-1).animate, false);
assert.equal(left.presentation.shadow, false);
assert.deepEqual(left.controller.getState(), { edge: "left" });
assert.equal(left.activity.hideLine, 1);
assert.deepEqual(left.activity.collapsedLayers, [true]);
left.controller.noteUserWindowInteraction();
assert.deepEqual(left.controller.getState(), { edge: "left" });
assert.deepEqual(left.controller.toggle(), { status: "expanded" });
assert.equal(left.controller.hasActiveSession(), true);
assert.deepEqual(left.getBounds(), leftBounds);
assert.equal(left.presentation.shadow, true);
assert.equal(left.activity.focus, 1);
assert.equal(left.activity.moveTop, 1);
assert.equal(left.activity.markProgrammaticMove, 2);
assert.deepEqual(left.activity.collapsedLayers, [true, false]);

const rightBounds = { x: 1020, y: 180, width: 900, height: 600 };
const right = createController({ initialBounds: rightBounds });
assert.deepEqual(right.controller.toggle(), { status: "collapsed", edge: "right" });
assert.deepEqual(right.getBounds(), { ...rightBounds, x: 1915 });

const topBounds = { x: 500, y: 0, width: 900, height: 600 };
const top = createController({ initialBounds: topBounds });
assert.deepEqual(top.controller.toggle(), { status: "collapsed", edge: "top" });
assert.deepEqual(top.getBounds(), { ...topBounds, y: -595 });

const bottomBounds = { x: 500, y: 480, width: 900, height: 600 };
const bottom = createController({ initialBounds: bottomBounds, display: topTaskbarDisplay });
assert.deepEqual(bottom.controller.toggle(), { status: "collapsed", edge: "bottom" });
assert.deepEqual(bottom.getBounds(), { ...bottomBounds, y: 1075 });

const blockedTaskbar = createController({ initialBounds: { x: 500, y: 440, width: 900, height: 600 } });
assert.deepEqual(blockedTaskbar.controller.toggle(), { status: "blocked", reason: "taskbar-edge" });
assert.equal(blockedTaskbar.appliedBounds.length, 0);

const cornerPrefersAllowedEdge = createController({ initialBounds: { x: 0, y: 440, width: 900, height: 600 } });
assert.deepEqual(cornerPrefersAllowedEdge.controller.toggle(), { status: "collapsed", edge: "left" });

const nearEdgeWithoutSnap = createController({ initialBounds: { x: 990, y: 200, width: 900, height: 600 } });
assert.deepEqual(nearEdgeWithoutSnap.controller.toggle(), { status: "collapsed", edge: "right" });

const displaySeam = createController({
  initialBounds: rightBounds,
  isDockEdgeExposed: (_display, edge) => edge !== "right"
});
assert.deepEqual(displaySeam.controller.toggle(), { status: "blocked", reason: "display-seam" });
assert.equal(displaySeam.controller.getState(), null);

const automatic = createController({ initialBounds: leftBounds });
automatic.sample({ x: 200, y: 300 }, 0);
automatic.sample({ x: 1200, y: 300 }, 1);
assert.deepEqual(automatic.controller.getState(), { edge: "left" });
assert.deepEqual(automatic.getBounds(), { ...leftBounds, x: -895 });
automatic.sample({ x: 0, y: 300 }, 2);
assert.equal(automatic.controller.getState(), null);
assert.deepEqual(automatic.getBounds(), leftBounds);
assert.equal(automatic.activity.focus, 0);
assert.equal(automatic.activity.moveTop, 1);
assert.deepEqual(automatic.activity.collapsedLayers, [true, false]);

automatic.context.interactionBlocked = true;
automatic.sample({ x: 1200, y: 300 }, 3);
assert.equal(automatic.controller.getState(), null);
automatic.context.interactionBlocked = false;
automatic.sample({ x: 1200, y: 300 }, 422);
assert.deepEqual(automatic.controller.getState(), { edge: "left" });

const rightGapBounds = { x: 1015, y: 180, width: 900, height: 600 };
const edgeGap = createController({ initialBounds: rightGapBounds });
edgeGap.sample({ x: 1200, y: 300 }, 0);
edgeGap.sample({ x: 1918, y: 300 }, 1);
assert.equal(edgeGap.controller.getState(), null);
edgeGap.sample({ x: 1000, y: 300 }, 2);
assert.deepEqual(edgeGap.controller.getState(), { edge: "right" });

const userMoved = createController({ initialBounds: leftBounds });
userMoved.controller.noteUserWindowInteraction(520);
userMoved.sample({ x: 1200, y: 300 }, 519);
assert.equal(userMoved.controller.getState(), null);
userMoved.sample({ x: 1200, y: 300 }, 520);
assert.deepEqual(userMoved.controller.getState(), { edge: "left" });

const resizedAfterReveal = createController({ initialBounds: leftBounds });
resizedAfterReveal.sample({ x: 200, y: 300 }, 0);
resizedAfterReveal.sample({ x: 1200, y: 300 }, 1);
resizedAfterReveal.sample({ x: 0, y: 300 }, 2);
assert.equal(resizedAfterReveal.controller.hasActiveSession(), true);
resizedAfterReveal.controller.noteUserWindowInteraction(520);
assert.equal(resizedAfterReveal.controller.hasActiveSession(), false);
resizedAfterReveal.setBounds({ ...leftBounds, width: 1100 });
resizedAfterReveal.sample({ x: 1200, y: 300 }, 522);
assert.deepEqual(resizedAfterReveal.controller.getState(), { edge: "left" });
assert.deepEqual(resizedAfterReveal.controller.getExpandedBounds(), { ...leftBounds, width: 1100 });

const suppressed = createController({ initialBounds: leftBounds });
suppressed.sample({ x: 200, y: 300 }, 0);
suppressed.controller.suppressFor(1000);
suppressed.sample({ x: 1200, y: 300 }, 999);
assert.equal(suppressed.controller.getState(), null);
suppressed.sample({ x: 1200, y: 300 }, 1000);
assert.deepEqual(suppressed.controller.getState(), { edge: "left" });

const unavailable = createController({ initialBounds: leftBounds, enabled: false });
assert.deepEqual(unavailable.controller.toggle(), { status: "unavailable" });
const settings = createController({ initialBounds: leftBounds, shellState: "settings" });
assert.deepEqual(settings.controller.toggle(), { status: "blocked", reason: "shell-state" });

const fixed = createController({ initialBounds: leftBounds, fixed: true });
assert.deepEqual(fixed.controller.toggle(), { status: "unavailable" });
fixed.sample({ x: 1200, y: 300 }, 1);
assert.equal(fixed.controller.getState(), null);
fixed.controller.setFixed(false);
fixed.sample({ x: 1200, y: 300 }, 2);
assert.deepEqual(fixed.controller.getState(), { edge: "left" });
fixed.controller.setFixed(true);
assert.equal(fixed.controller.getState(), null);
assert.deepEqual(fixed.getBounds(), leftBounds);

const preview = createController({
  initialBounds: rightBounds,
  shellState: "preview",
  collapsibleStates: new Set(["preview"])
});
assert.deepEqual(preview.controller.toggle(), { status: "collapsed", edge: "right" });
assert.deepEqual(preview.controller.getExpandedBounds(), rightBounds);
assert.equal(preview.controller.updateExpandedBounds({ x: 1000, y: 140, width: 800, height: 500 }), true);
assert.deepEqual(preview.controller.getExpandedBounds(), { x: 1120, y: 140, width: 800, height: 500 });
assert.deepEqual(preview.getBounds(), { x: 1915, y: 140, width: 800, height: 500 });
preview.sample({ x: 1919, y: 200 }, 1);
assert.deepEqual(preview.getBounds(), { x: 1120, y: 140, width: 800, height: 500 });

const displayChanged = createController({ initialBounds: rightBounds });
assert.deepEqual(displayChanged.controller.toggle(), { status: "collapsed", edge: "right" });
displayChanged.setDisplay({
  id: 2,
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  workArea: { x: 0, y: 0, width: 1280, height: 680 },
  scaleFactor: 1.25
});
assert.equal(displayChanged.controller.reconcileDisplayConfiguration(), true);
assert.equal(displayChanged.controller.getState(), null);
assert.deepEqual(displayChanged.getBounds(), { x: 380, y: 80, width: 900, height: 600 });
assert.equal(displayChanged.presentation.shadow, true);
assert.equal(displayChanged.activity.markProgrammaticMove, 2);
assert.equal(displayChanged.activity.markProgrammaticResize, 0);

const displayShrank = createController({ initialBounds: { x: 0, y: 0, width: 1400, height: 900 } });
displayShrank.setDisplay({
  ...bottomTaskbarDisplay,
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  workArea: { x: 0, y: 0, width: 1280, height: 680 }
});
assert.equal(displayShrank.controller.reconcileDisplayConfiguration(), true);
assert.deepEqual(displayShrank.getBounds(), { x: 0, y: 0, width: 1280, height: 680 });
assert.equal(displayShrank.activity.markProgrammaticResize, 1);

const createLayerWindow = () => {
  const activity = { alwaysOnTop: [], focus: 0, moveTop: 0 };
  let alwaysOnTop = false;
  return {
    activity,
    window: {
      focus: () => { activity.focus += 1; },
      isAlwaysOnTop: () => alwaysOnTop,
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      moveTop: () => { activity.moveTop += 1; },
      setAlwaysOnTop: (active, level) => {
        alwaysOnTop = active;
        activity.alwaysOnTop.push({ active, level });
      }
    }
  };
};
const mainLayer = createLayerWindow();
const previewLayer = createLayerWindow();
let mainFixed = false;
let previewFixed = false;
let previewActive = false;
let lineLayerApplications = 0;
const layerController = new WindowLayerController({
  applyLineLayer: () => { lineLayerApplications += 1; },
  getMainFixed: () => mainFixed,
  getMainWindow: () => mainLayer.window,
  getPreviewFixed: () => previewFixed,
  getPreviewWindow: () => previewLayer.window,
  isPreviewActive: () => previewActive
});
layerController.setMainCollapsedLayerActive(true);
assert.deepEqual(mainLayer.activity.alwaysOnTop.at(-1), { active: true, level: "floating" });
assert.equal(mainLayer.activity.focus, 0);
assert.equal(mainLayer.activity.moveTop, 1);
layerController.setMainCollapsedLayerActive(false);
assert.deepEqual(mainLayer.activity.alwaysOnTop.at(-1), { active: false, level: undefined });
mainFixed = true;
layerController.apply();
assert.deepEqual(mainLayer.activity.alwaysOnTop.at(-1), { active: true, level: "screen-saver" });
assert.equal(mainLayer.activity.focus, 1);
previewActive = true;
layerController.setPreviewCollapsedLayerActive(true);
assert.deepEqual(previewLayer.activity.alwaysOnTop.at(-1), { active: true, level: "floating" });
assert.equal(previewLayer.activity.focus, 0);
previewFixed = true;
layerController.apply();
assert.deepEqual(previewLayer.activity.alwaysOnTop.at(-1), { active: true, level: "screen-saver" });
assert.ok(lineLayerApplications >= 5);

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "electron", "dockedShellController.ts"), "utf8");
const automationSource = fs.readFileSync(path.join(root, "electron", "dockedShellAutomation.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "src", "renderer", "main.tsx"), "utf8");
assert.match(automationSource, /enableDebugShortcut && globalShortcut\.register\(debugShortcut/u);
assert.match(automationSource, /setFixed: \(nextFixed: boolean\) => controller\.setFixed\(nextFixed\)/u);
assert.match(automationSource, /getState: \(\) => controller\.getState\(\)/u);
assert.match(automationSource, /hasActiveSession: \(\) => controller\.hasActiveSession\(\)/u);
assert.doesNotMatch(automationSource, /ipcMain/u);
assert.match(controllerSource, /window\.setBounds\(this\.getCollapsedWindowBounds\(session\), false\)/u);
assert.match(mainSource, /const applyEdgeSnapAfterMove = \(\) => \{[\s\S]*?dockedShellController\?\.hasActiveSession\(\)[\s\S]*?getEdgeSnappedBounds/u);
assert.match(mainSource, /mainWindow\.on\("move", \(\) => \{[\s\S]*?isProgrammaticMoveGuardActive\(\) \|\| dockedShellController\?\.hasActiveSession\(\)/u);
assert.match(mainSource, /const applyPreviewEdgeSnapAfterMove = \(\) => \{[\s\S]*?previewDockedShell\.hasActiveSession\(\)[\s\S]*?getEdgeSnappedBounds/u);
assert.doesNotMatch(controllerSource, /setShape|setResizable|setMovable/u);
assert.doesNotMatch(rendererSource, /DockedShellHost|DockedShellProbeHost/u);

console.log(JSON.stringify({
  fourDirectionNativeBoundsVerified: true,
  taskbarEdgeExcluded: true,
  edgeSnapPreferenceIndependent: true,
  immediateCollapseAndRevealVerified: true,
  temporaryCollapsedLayerVerified: true,
  edgeGapIncludedInHoverRegion: true,
  programmaticMoveGuardForwarded: true,
  windowPresentationRestored: true,
  rendererTranslationRemoved: true,
  fixedWindowSuppressionVerified: true,
  previewStateAndCollapsedResizeVerified: true,
  displayConfigurationRecoveryVerified: true
}));
