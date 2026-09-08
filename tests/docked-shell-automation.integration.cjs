const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DockedShellController,
  dockedShellPeekThicknessPx,
  dockedShellRevealThicknessPx
} = require("../dist-electron/dockedShellController.js");
const { WindowLayerController } = require("../dist-electron/windowLayerController.js");
const { applyEdgeCollapseWindowMode } = require("../dist-electron/edgeCollapseWindowMode.js");

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

const createController = ({ initialBounds, display = bottomTaskbarDisplay, enabled = true, fixed = false, shellState = "normal", collapsibleStates, isDockEdgeExposed, applyNativeBounds = (bounds) => bounds }) => {
  let bounds = { ...initialBounds };
  let activeDisplay = display;
  let clock = 0;
  let minimized = false;
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
    isMinimized: () => minimized,
    isVisible: () => !minimized,
    moveTop: () => { activity.moveTop += 1; },
    setBounds: (nextBounds, animate) => {
      bounds = { ...applyNativeBounds({ ...nextBounds }) };
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
  return { activity, appliedBounds, context, controller, getBounds: () => ({ ...bounds }), presentation, sample, setBounds: (nextBounds) => { bounds = { ...nextBounds }; }, setDisplay: (nextDisplay) => { activeDisplay = nextDisplay; }, setMinimized: (nextMinimized) => { minimized = nextMinimized; } };
};

assert.equal(dockedShellPeekThicknessPx, 2);
assert.equal(dockedShellRevealThicknessPx, 2);

const createWindowModeProbe = ({ maximized = false, minimized = false } = {}) => {
  let maximizable = true;
  const activity = { bounds: [], unmaximize: 0 };
  const window = {
    getNormalBounds: () => ({ x: 120, y: 90, width: 900, height: 600 }),
    isDestroyed: () => false,
    isMaximized: () => maximized,
    isMinimized: () => minimized,
    setBounds: (bounds) => { activity.bounds.push({ ...bounds }); },
    setMaximizable: (value) => { maximizable = value; },
    unmaximize: () => { activity.unmaximize += 1; maximized = false; }
  };
  return { activity, getMaximizable: () => maximizable, window };
};

const edgeModeWindow = createWindowModeProbe({ maximized: true });
let edgeModeMoves = 0;
assert.equal(applyEdgeCollapseWindowMode({
  enabled: true,
  getRestoredBounds: edgeModeWindow.window.getNormalBounds,
  isNativeSnapActive: () => true,
  markProgrammaticMove: () => { edgeModeMoves += 1; },
  window: edgeModeWindow.window
}), true);
assert.equal(edgeModeWindow.getMaximizable(), false);
assert.equal(edgeModeWindow.activity.unmaximize, 1);
assert.equal(edgeModeMoves, 1);
assert.deepEqual(edgeModeWindow.activity.bounds, [{ x: 120, y: 90, width: 900, height: 600 }]);
assert.equal(applyEdgeCollapseWindowMode({
  enabled: false,
  getRestoredBounds: edgeModeWindow.window.getNormalBounds,
  isNativeSnapActive: () => false,
  markProgrammaticMove: () => {},
  window: edgeModeWindow.window
}), true);
assert.equal(edgeModeWindow.getMaximizable(), true);

const leftBounds = { x: 0, y: 200, width: 900, height: 600 };
const left = createController({ initialBounds: leftBounds });
assert.deepEqual(left.controller.toggle(), { status: "collapsed", edge: "left" });
assert.equal(left.controller.hasActiveSession(), true);
assert.deepEqual(left.getBounds(), { ...leftBounds, x: -898 });
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
assert.deepEqual(right.getBounds(), { ...rightBounds, x: 1918 });

const topBounds = { x: 500, y: 0, width: 900, height: 600 };
const top = createController({ initialBounds: topBounds });
assert.deepEqual(top.controller.toggle(), { status: "collapsed", edge: "top" });
assert.deepEqual(top.getBounds(), { ...topBounds, y: -598 });

const bottomBounds = { x: 500, y: 480, width: 900, height: 600 };
const bottom = createController({ initialBounds: bottomBounds, display: topTaskbarDisplay });
assert.deepEqual(bottom.controller.toggle(), { status: "collapsed", edge: "bottom" });
assert.deepEqual(bottom.getBounds(), { ...bottomBounds, y: 1078 });

const blockedTaskbar = createController({ initialBounds: { x: 500, y: 480, width: 900, height: 600 } });
assert.deepEqual(blockedTaskbar.controller.toggle(), { status: "blocked", reason: "taskbar-edge" });
assert.equal(blockedTaskbar.appliedBounds.length, 0);

const cornerPrefersAllowedEdge = createController({ initialBounds: { x: 0, y: 480, width: 900, height: 600 } });
assert.deepEqual(cornerPrefersAllowedEdge.controller.toggle(), { status: "collapsed", edge: "left" });

const nearEdgeWithoutSnap = createController({ initialBounds: { x: 990, y: 200, width: 900, height: 600 } });
assert.deepEqual(nearEdgeWithoutSnap.controller.toggle(), { status: "blocked", reason: "not-docked" });
assert.equal(nearEdgeWithoutSnap.controller.hasActiveSession(), false);

const onePixelInside = createController({ initialBounds: { x: 1019, y: 180, width: 900, height: 600 } });
assert.deepEqual(onePixelInside.controller.toggle(), { status: "blocked", reason: "not-docked" });
assert.equal(onePixelInside.controller.hasActiveSession(), false);

const onePixelOutside = createController({ initialBounds: { x: 1021, y: 180, width: 900, height: 600 } });
assert.deepEqual(onePixelOutside.controller.toggle(), { status: "collapsed", edge: "right" });
assert.deepEqual(onePixelOutside.controller.getExpandedBounds(), rightBounds);
assert.deepEqual(onePixelOutside.getBounds(), { ...rightBounds, x: 1918 });

const exactBoundaryRelease = createController({ initialBounds: rightBounds });
exactBoundaryRelease.sample({ x: 1200, y: 300 }, 0);
assert.equal(exactBoundaryRelease.controller.hasActiveSession(), true);
exactBoundaryRelease.setBounds({ x: 1019, y: 180, width: 900, height: 600 });
exactBoundaryRelease.sample({ x: 1200, y: 300 }, 1);
assert.equal(exactBoundaryRelease.controller.hasActiveSession(), false);

const displaySeam = createController({
  initialBounds: rightBounds,
  isDockEdgeExposed: (_display, edge) => edge !== "right"
});
assert.deepEqual(displaySeam.controller.toggle(), { status: "blocked", reason: "display-seam" });
assert.equal(displaySeam.controller.getState(), null);

const displaySeamMoveSettlement = createController({
  initialBounds: { x: 1027, y: 180, width: 900, height: 600 },
  isDockEdgeExposed: (_display, edge) => edge !== "right"
});
displaySeamMoveSettlement.controller.handleUserMoveCompleted();
assert.equal(displaySeamMoveSettlement.controller.hasActiveSession(), false);
assert.deepEqual(displaySeamMoveSettlement.getBounds(), { x: 1027, y: 180, width: 900, height: 600 });
assert.equal(displaySeamMoveSettlement.appliedBounds.length, 0);

const secondDisplay = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1280, height: 1024 },
  workArea: { x: 1920, y: 0, width: 1280, height: 984 },
  scaleFactor: 1.25
};
const movedFullyToSecondDisplay = createController({
  initialBounds: { x: 2300, y: 120, width: 900, height: 600 },
  display: secondDisplay,
  isDockEdgeExposed: (_display, edge) => edge !== "left"
});
assert.deepEqual(movedFullyToSecondDisplay.controller.toggle(), { status: "collapsed", edge: "right" });
assert.deepEqual(movedFullyToSecondDisplay.getBounds(), { x: 3198, y: 120, width: 900, height: 600 });

const automatic = createController({ initialBounds: leftBounds });
automatic.sample({ x: 200, y: 300 }, 0);
automatic.sample({ x: 1200, y: 300 }, 1);
assert.deepEqual(automatic.controller.getState(), { edge: "left" });
assert.deepEqual(automatic.getBounds(), { ...leftBounds, x: -898 });
automatic.sample({ x: 0, y: 300 }, 2);
assert.equal(automatic.controller.getState(), null);
assert.deepEqual(automatic.getBounds(), leftBounds);
assert.equal(automatic.activity.focus, 0);
assert.equal(automatic.activity.moveTop, 1);
assert.deepEqual(automatic.activity.collapsedLayers, [true, false]);

const minimizedWhileCollapsed = createController({ initialBounds: leftBounds });
assert.deepEqual(minimizedWhileCollapsed.controller.toggle(), { status: "collapsed", edge: "left" });
minimizedWhileCollapsed.setMinimized(true);
minimizedWhileCollapsed.controller.handleMinimize();
minimizedWhileCollapsed.sample({ x: 0, y: 300 }, 1);
assert.deepEqual(minimizedWhileCollapsed.controller.getState(), { edge: "left" });
assert.deepEqual(minimizedWhileCollapsed.getBounds(), { ...leftBounds, x: -898 });
assert.deepEqual(minimizedWhileCollapsed.activity.collapsedLayers, [true, false]);
minimizedWhileCollapsed.setMinimized(false);
assert.equal(minimizedWhileCollapsed.controller.handleRestore(), true);
assert.equal(minimizedWhileCollapsed.controller.getState(), null);
assert.equal(minimizedWhileCollapsed.controller.hasActiveSession(), true);
assert.deepEqual(minimizedWhileCollapsed.getBounds(), leftBounds);
assert.equal(minimizedWhileCollapsed.presentation.shadow, true);
assert.deepEqual(minimizedWhileCollapsed.activity.collapsedLayers, [true, false]);

const disabledWhileMinimized = createController({ initialBounds: leftBounds });
disabledWhileMinimized.controller.toggle();
disabledWhileMinimized.setMinimized(true);
disabledWhileMinimized.controller.handleMinimize();
disabledWhileMinimized.controller.setEnabled(false);
disabledWhileMinimized.setMinimized(false);
assert.equal(disabledWhileMinimized.controller.handleRestore(), true);
assert.deepEqual(disabledWhileMinimized.getBounds(), leftBounds);
assert.equal(disabledWhileMinimized.controller.hasActiveSession(), false);

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
assert.equal(edgeGap.controller.getState(), null);

const settledAtBoundary = createController({ initialBounds: rightBounds });
settledAtBoundary.controller.handleUserMoveCompleted();
assert.equal(settledAtBoundary.controller.hasActiveSession(), true);
assert.equal(settledAtBoundary.appliedBounds.length, 0);
settledAtBoundary.sample({ x: 1000, y: 300 }, 1);
assert.deepEqual(settledAtBoundary.controller.getState(), { edge: "right" });

const settledPastBoundary = createController({ initialBounds: { x: 1027, y: 180, width: 900, height: 600 } });
settledPastBoundary.controller.handleUserMoveCompleted();
assert.equal(settledPastBoundary.controller.hasActiveSession(), true);
assert.equal(settledPastBoundary.controller.getState(), null);
assert.deepEqual(settledPastBoundary.getBounds(), rightBounds);
assert.deepEqual(settledPastBoundary.appliedBounds, [{ bounds: rightBounds, animate: false }]);
assert.equal(settledPastBoundary.activity.markProgrammaticMove, 1);
settledPastBoundary.sample({ x: 1000, y: 300 }, 1);
assert.deepEqual(settledPastBoundary.controller.getState(), { edge: "right" });
assert.equal(settledPastBoundary.activity.markProgrammaticMove, 2);

const settledInside = createController({ initialBounds: { x: 1019, y: 180, width: 900, height: 600 } });
settledInside.controller.handleUserMoveCompleted();
assert.equal(settledInside.controller.hasActiveSession(), false);
settledInside.setBounds(rightBounds);
settledInside.sample({ x: 1000, y: 300 }, 1);
assert.equal(settledInside.controller.hasActiveSession(), true);
assert.equal(settledInside.controller.getState(), null);

const blockedMoveSettlement = createController({ initialBounds: { x: 1027, y: 180, width: 900, height: 600 } });
blockedMoveSettlement.context.interactionBlocked = true;
blockedMoveSettlement.controller.handleUserMoveCompleted();
assert.equal(blockedMoveSettlement.controller.hasActiveSession(), false);
assert.equal(blockedMoveSettlement.appliedBounds.length, 0);

const highDpiRight = createController({
  initialBounds: rightBounds,
  display: { ...bottomTaskbarDisplay, scaleFactor: 1.5 },
  applyNativeBounds: (bounds) => bounds.x < 1900 ? { ...bounds, x: bounds.x + 1 } : bounds
});
assert.deepEqual(highDpiRight.controller.toggle(), { status: "collapsed", edge: "right" });
for (let cycle = 0; cycle < 60; cycle += 1) {
  highDpiRight.sample({ x: 1919, y: 300 }, cycle * 2 + 1);
  assert.equal(highDpiRight.controller.hasActiveSession(), true);
  assert.equal(highDpiRight.getBounds().x, rightBounds.x + 1);
  highDpiRight.sample({ x: 1000, y: 300 }, cycle * 2 + 2);
  assert.deepEqual(highDpiRight.controller.getState(), { edge: "right" });
  assert.deepEqual(highDpiRight.controller.getExpandedBounds(), rightBounds);
}

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
assert.deepEqual(preview.getBounds(), { x: 1918, y: 140, width: 800, height: 500 });
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
assert.deepEqual(mainLayer.activity.alwaysOnTop.at(-1), { active: true, level: "screen-saver" });
assert.equal(mainLayer.window.isAlwaysOnTop(), true, "active preview must not suppress the main fixed layer");
assert.deepEqual(previewLayer.activity.alwaysOnTop.at(-1), { active: true, level: "floating" });
assert.equal(previewLayer.activity.focus, 0);
mainFixed = false;
layerController.apply();
assert.deepEqual(mainLayer.activity.alwaysOnTop.at(-1), { active: false, level: undefined });
assert.equal(mainLayer.window.isAlwaysOnTop(), false, "main fixed state remains independently mutable while preview is active");
previewFixed = true;
layerController.apply();
assert.deepEqual(previewLayer.activity.alwaysOnTop.at(-1), { active: true, level: "screen-saver" });
assert.ok(lineLayerApplications >= 5);

const root = path.resolve(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(root, "electron", "dockedShellController.ts"), "utf8");
const automationSource = fs.readFileSync(path.join(root, "electron", "dockedShellAutomation.ts"), "utf8");
const windowModeSource = fs.readFileSync(path.join(root, "electron", "edgeCollapseWindowMode.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "src", "renderer", "main.tsx"), "utf8");
assert.match(automationSource, /enableDebugShortcut && globalShortcut\.register\(debugShortcut/u);
assert.match(automationSource, /setFixed: \(nextFixed: boolean\) => controller\.setFixed\(nextFixed\)/u);
assert.match(automationSource, /getState: \(\) => controller\.getState\(\)/u);
assert.match(automationSource, /hasActiveSession: \(\) => controller\.hasActiveSession\(\)/u);
assert.match(automationSource, /window\.on\("minimize", suspendMinimizedWindow\)/u);
assert.match(automationSource, /window\.on\("restore", restoreMinimizedWindow\)/u);
assert.match(automationSource, /window\.on\("moved", settleMovedWindow\)/u);
assert.match(automationSource, /window\.removeListener\("moved", settleMovedWindow\)/u);
assert.match(windowModeSource, /window\.setMaximizable\(false\)/u);
assert.match(windowModeSource, /window\.setMaximizable\(true\)/u);
assert.equal((mainSource.match(/maximizable: !edgeCollapseEnabled/gu) ?? []).length, 2);
assert.doesNotMatch(automationSource, /ipcMain/u);
assert.match(controllerSource, /window\.setBounds\(this\.getCollapsedWindowBounds\(session\), false\)/u);
assert.match(mainSource, /mainWindow\.on\("move", \(\) => \{[\s\S]*?isProgrammaticMoveGuardActive\(\) \|\| dockedShellController\?\.hasActiveSession\(\)/u);
assert.match(mainSource, /getShellContext: \(\) => \(\{[^}]*?isNativeSnapActive\(\)/u);
assert.match(mainSource, /isNativeSnapActive: \(\) => isPreviewNativeSnapActive\(\)/u);
assert.doesNotMatch(mainSource, /getEdgeSnappedBounds|applyEdgeSnapAfterMove|applyPreviewEdgeSnapAfterMove/u);
assert.doesNotMatch(controllerSource, /setShape|setResizable|setMovable/u);
assert.doesNotMatch(rendererSource, /DockedShellHost|DockedShellProbeHost/u);

console.log(JSON.stringify({
  fourDirectionNativeBoundsVerified: true,
  taskbarEdgeExcluded: true,
  edgeSnapPreferenceIndependent: true,
  exactScreenBoundaryEligibilityVerified: true,
  userMoveSettlementVerified: true,
  overflowReleaseAlignmentVerified: true,
  immediateCollapseAndRevealVerified: true,
  temporaryCollapsedLayerVerified: true,
  edgeGapIncludedInHoverRegion: true,
  highDpiRepeatedRevealAnchorStable: true,
  programmaticMoveGuardForwarded: true,
  nativeSnapCapabilityFollowsPreference: true,
  minimizedCollapsedSessionRestored: true,
  windowPresentationRestored: true,
  rendererTranslationRemoved: true,
  fixedWindowSuppressionVerified: true,
  previewStateAndCollapsedResizeVerified: true,
  displayConfigurationRecoveryVerified: true
}));
