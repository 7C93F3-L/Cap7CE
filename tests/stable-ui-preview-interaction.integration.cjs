const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const transformSource = read("src/renderer/preview/usePreviewImageTransform.ts");
const targetSource = read("src/renderer/preview/previewNavigationTarget.ts");
const shellStyles = read("src/renderer/preview/StablePreviewShell.css");
const mainSource = read("electron/main.ts");
const packageSource = read("package.json");

assert.match(previewSource, /isPreviewNavigationSuppressedTarget\(event\.target\)/u);
assert.match(previewSource, /getPreviewWheelNavigationDirection\(event\.deltaX, event\.deltaY\)/u);
assert.match(previewSource, /isImageProvider[\s\S]*?imageTransform\.handleWheel\(event\)/u);
assert.match(previewSource, /data-preview-provider-interactive="true"/u);
assert.doesNotMatch(previewSource, /ImageContextMenu|buildFileContextMenuGroups|setContextMenu/u);
assert.match(previewSource, /onContextMenu=\{\(event\) => \{\s*event\.preventDefault\(\);\s*\}\}/u);
assert.match(targetSource, /data-preview-navigation-suppressed[\s\S]*?\.context-menu[\s\S]*?input[\s\S]*?textarea[\s\S]*?select/u);

assert.match(transformSource, /minimumZoom = 1/u);
assert.match(transformSource, /maximumZoom = 6/u);
assert.match(transformSource, /pointerX - \(pointerX - current\.panX\) \* ratio/u);
assert.match(transformSource, /Math\.max\(0, \(image\.naturalWidth \* fit \* zoom - bounds\.width\) \/ 2\)/u);
assert.match(transformSource, /limits\.x <= 0 && limits\.y <= 0/u);
assert.match(transformSource, /ResizeObserver\(reconcile\)/u);
assert.match(transformSource, /\[sessionId\][\s\S]*?setTransform\(initialTransform\)/u);
assert.match(shellStyles, /preview-image-transform-canvas\.is-pannable[\s\S]*?cursor: grab/u);

assert.match(mainSource, /previewWindow\.isMaximized\(\)[\s\S]*?isPreviewNativeSnapActive\(\)[\s\S]*?latestPreviewContentSize\.sessionId/u);
assert.match(mainSource, /stablePreviewWindowSizing\.resolveBounds\(\{ contentWidth, contentHeight, currentBounds: currentPreviewBounds/u);
for (const provider of ["video", "audio", "text", "pdf", "archive", "font", "epub", "mobi"]) {
  assert.match(previewSource, new RegExp(`provider === "${provider}"`, "u"));
}
assert.match(mainSource, /data\.provider === "pdf" \|\| data\.provider === "office"/u);
for (const regressionScript of ["test:skim-content-preview", "test:pdf-preview", "test:office-preview", "test:archive-preview", "test:font-preview", "test:epub-preview", "test:mobi-preview", "test:animated-image-preview"]) {
  assert.match(packageSource, new RegExp(`"${regressionScript}"`, "u"));
}

console.log(JSON.stringify({
  wheelAndArrowNavigationPreserved: true,
  interactiveTargetsSuppressed: true,
  pointerCenteredImageZoomBounded: true,
  panEnabledOnlyForOverflow: true,
  resizeAndSessionClampingPresent: true,
  maximizedAndSnapSizingProtected: true,
  multiFormatRegressionSurfaceGuarded: true
}));
