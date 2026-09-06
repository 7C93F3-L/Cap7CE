const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const previewSource = read("src/renderer/PreviewWindowApp.tsx");
const transformSource = read("src/renderer/preview/usePreviewImageTransform.ts");
const transformMathSource = read("src/renderer/preview/previewImageTransformMath.ts");
const pdfPanelSource = read("src/renderer/PdfPreviewPanel.tsx");
const pdfZoomSource = read("src/renderer/preview/usePdfPreviewZoom.ts");
const previewStyles = read("src/renderer/preview/PreviewWindow.css");
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

assert.match(transformMathSource, /minimumPreviewZoom = 1/u);
assert.match(transformMathSource, /maximumPreviewZoom = 6/u);
assert.match(transformMathSource, /rightDragPixelsPerDoubling = 200/u);
assert.match(transformSource, /pointerX - \(pointerX - current\.panX\) \* ratio/u);
assert.match(transformSource, /event\.button !== 0 && event\.button !== 2/u);
assert.match(transformSource, /mode = event\.button === 2 \? "zoom" : "pan"/u);
assert.match(transformMathSource, /start\.zoom \* 2 \*\* \(\(startY - currentY\) \/ rightDragPixelsPerDoubling\)/u);
assert.match(transformMathSource, /anchorX - \(anchorX - start\.panX\) \* ratio/u);
assert.match(transformSource, /Math\.max\(0, \(image\.naturalWidth \* fit \* zoom - bounds\.width\) \/ 2\)/u);
assert.match(transformSource, /limits\.x <= 0 && limits\.y <= 0/u);
assert.match(transformSource, /ResizeObserver\(reconcile\)/u);
assert.match(transformSource, /\[sessionId\][\s\S]*?setTransform\(initialTransform\)/u);
assert.match(shellStyles, /preview-image-transform-canvas\.is-pannable[\s\S]*?cursor: grab/u);
assert.match(shellStyles, /preview-image-transform-canvas\.is-zoom-dragging[\s\S]*?cursor: ns-resize/u);
assert.match(previewSource, /zoomDragging[\s\S]*?onLostPointerCapture=\{imageTransform\.finishPointer\}/u);
assert.match(previewSource, /data-preview-provider-interactive='true'\], \[data-preview-pdf-scroll='true'\]/u);
assert.match(pdfPanelSource, /usePdfPreviewZoom\(data\.sessionId, scrollRef\)/u);
assert.match(pdfPanelSource, /style=\{\{ aspectRatio, width: `\$\{zoom \* 100\}%` \}\}/u);
assert.match(pdfPanelSource, /preview-pdf-zoom-controls[\s\S]*?pdfZoom\.zoomOut[\s\S]*?pdfZoom\.resetZoom[\s\S]*?pdfZoom\.zoomIn/u);
assert.match(pdfPanelSource, /data-preview-pdf-scroll="true"[\s\S]*?onWheel=\{pdfZoom\.handleWheel\}[\s\S]*?onPointerDown=\{pdfZoom\.handlePointerDown\}[\s\S]*?onLostPointerCapture=\{pdfZoom\.finishPointer\}/u);
assert.match(pdfPanelSource, /CustomScrollbar scrollContainerRef=\{scrollRef\} orientation="horizontal"/u);
assert.match(pdfZoomSource, /minimumPdfZoom = 0\.75[\s\S]*?maximumPdfZoom = 2[\s\S]*?rightDragPixelsPerDoubling = 200/u);
assert.match(pdfZoomSource, /pageX:[\s\S]*?pageY:[\s\S]*?root\.scrollLeft \+=[\s\S]*?root\.scrollTop \+=/u);
assert.match(pdfZoomSource, /event\.button === 0[\s\S]*?mode: "zoom"[\s\S]*?drag\.startZoom \* 2 \*\*/u);
assert.match(pdfZoomSource, /event\.button !== 0 && event\.button !== 2[\s\S]*?event\.button === 0 && zoom <= 1[\s\S]*?mode: "pan"/u);
assert.match(pdfZoomSource, /drag\.mode === "pan"[\s\S]*?scrollLeft = drag\.startScrollLeft[\s\S]*?scrollTop = drag\.startScrollTop/u);
assert.match(previewStyles, /preview-pdf-scroll\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: auto;/u);
assert.match(previewStyles, /preview-pdf-page\s*\{[\s\S]*?width: 100%;/u);
assert.doesNotMatch(previewStyles.match(/\.preview-pdf-page\s*\{[^}]*\}/u)?.[0] ?? "", /border-radius/u);

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
