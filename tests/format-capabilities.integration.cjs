const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

(async () => {
  const {
    fileFormatCapabilities,
    fileFormatCapabilityByExtension,
    indexableFileExtensionSet,
    skimCuratedFileExtensionSet
  } = require("../dist-electron/formatCapabilities.js");
  const { supportedVisualFileExtensionSet } = require("../dist-electron/supportedVisualFormats.js");
  const { isSupportedImageFilePath } = require("../dist-electron/imageScanner.js");

  assert.equal(fileFormatCapabilities.length, fileFormatCapabilityByExtension.size);
  assert.equal(fileFormatCapabilities.every((capability) => capability.extension.startsWith(".")), true);
  assert.equal(fileFormatCapabilities.every((capability) => capability.canBrowse), true);
  assert.equal(fileFormatCapabilities.every((capability) => capability.canIndex), true);

  const visualCapabilities = fileFormatCapabilities.filter((capability) => capability.category === "visual");
  const nonVisualCapabilities = fileFormatCapabilities.filter((capability) => capability.category !== "visual");
  assert.equal(visualCapabilities.length, 14);
  assert.equal(nonVisualCapabilities.length, 59);
  assert.equal(visualCapabilities.every((capability) => (
    capability.canSearch
    && capability.canThumbnail
    && capability.previewKind === "image"
    && capability.canAIIndex
  )), true);
  assert.equal(visualCapabilities.filter((capability) => capability.canDirectPreview).length, 7);
  assert.equal(nonVisualCapabilities.every((capability) => (
    capability.canSearch
    && !capability.canThumbnail
    && !capability.canDirectPreview
    && !capability.canAIIndex
  )), true);
  assert.deepEqual(
    Object.fromEntries([".txt", ".md", ".mp3", ".wav", ".mp4", ".mov"].map((extension) => [
      extension,
      fileFormatCapabilityByExtension.get(extension).previewKind
    ])),
    { ".txt": "text", ".md": "text", ".mp3": "audio", ".wav": "audio", ".mp4": "video", ".mov": "video" }
  );
  assert.equal(nonVisualCapabilities.filter((capability) => capability.previewKind === "fileInfo").length, 53);
  assert.deepEqual(
    [...supportedVisualFileExtensionSet].sort(),
    visualCapabilities.map((capability) => capability.extension).sort()
  );
  assert.equal(skimCuratedFileExtensionSet.size, 73);
  assert.deepEqual([...indexableFileExtensionSet].sort(), [...skimCuratedFileExtensionSet].sort());
  assert.equal(isSupportedImageFilePath("C:\\asset.png"), true);
  assert.equal(isSupportedImageFilePath("C:\\notes.txt"), false);
  assert.equal(isSupportedImageFilePath("C:\\document.docx"), false);

  const iconDirectory = path.join(__dirname, "..", "src", "renderer", "assets", "icons");
  for (const capability of nonVisualCapabilities) {
    assert.equal(fs.existsSync(path.join(iconDirectory, `${capability.iconName}.svg`)), true, capability.iconName);
  }

  console.log(JSON.stringify({
    centralCapabilitiesUnique: true,
    allWhitelistedFormatsIndexable: true,
    visualSearchBoundaryPreserved: true,
    nonVisualSearchEnabled: true,
    formalVisualScannerBoundaryPreserved: true,
    skimCuratedFormatCount: skimCuratedFileExtensionSet.size,
    formatIconsVerified: nonVisualCapabilities.length
  }));
})().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
