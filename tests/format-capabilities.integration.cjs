const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

(async () => {
  const {
    fileFormatCapabilities,
    fileFormatCapabilityByExtension,
    indexableFileExtensionSet,
    skimCuratedFileExtensionSet,
    skimDefaultFileExtensionSet
  } = require("../dist-electron/formatCapabilities.js");
  const { supportedVisualFileExtensionSet } = require("../dist-electron/supportedVisualFormats.js");
  const { isSupportedImageFilePath } = require("../dist-electron/imageScanner.js");

  assert.equal(fileFormatCapabilities.length, fileFormatCapabilityByExtension.size);
  assert.equal(fileFormatCapabilities.every((capability) => capability.extension.startsWith(".")), true);
  assert.equal(fileFormatCapabilities.every((capability) => capability.canBrowse), true);

  const formalVisualCapabilities = fileFormatCapabilities.filter((capability) => capability.category === "visual" && capability.canSearch);
  const formalNonVisualCapabilities = fileFormatCapabilities.filter((capability) => capability.category !== "visual" && capability.canIndex);
  const browseOnlyCapabilities = fileFormatCapabilities.filter((capability) => !capability.canIndex);
  assert.equal(formalVisualCapabilities.length, 14);
  assert.equal(formalNonVisualCapabilities.length, 60);
  assert.equal(browseOnlyCapabilities.length, 40);
  assert.equal(formalVisualCapabilities.every((capability) => (
    capability.canSearch
    && capability.canThumbnail
    && capability.previewKind === (capability.extension === ".pdf" ? "pdf" : "image")
    && capability.canAIIndex
  )), true);
  assert.equal(formalVisualCapabilities.filter((capability) => capability.canDirectPreview).length, 7);
  assert.equal(formalNonVisualCapabilities.every((capability) => (
    capability.canSearch
    && !capability.canThumbnail
    && !capability.canDirectPreview
    && !capability.canAIIndex
  )), true);
  assert.equal(browseOnlyCapabilities.every((capability) => (
    capability.canBrowse
    && !capability.canSearch
    && !capability.canThumbnail
    && capability.previewKind === "fileInfo"
    && !capability.canDirectPreview
    && !capability.canAIIndex
  )), true);
  assert.deepEqual(
    Object.fromEntries([
      ".txt", ".md", ".ini", ".html", ".csv", ".json", ".xml", ".yaml", ".yml",
      ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".pdf", ".m4a", ".mp3", ".wav", ".mp4", ".mov", ".webm"
    ].map((extension) => [
      extension,
      fileFormatCapabilityByExtension.get(extension).previewKind
    ])),
    {
      ".txt": "text", ".md": "text", ".ini": "text", ".html": "text",
      ".csv": "text", ".json": "text", ".xml": "text", ".yaml": "text", ".yml": "text",
      ".doc": "text", ".docx": "text",
      ".xls": "office", ".xlsx": "office", ".ppt": "office", ".pptx": "office",
      ".pdf": "pdf",
      ".m4a": "audio", ".mp3": "audio", ".wav": "audio",
      ".mp4": "video", ".mov": "video", ".webm": "video"
    }
  );
  assert.equal(formalNonVisualCapabilities.filter((capability) => capability.previewKind === "fileInfo").length, 39);
  assert.deepEqual(
    [...supportedVisualFileExtensionSet].sort(),
    formalVisualCapabilities.map((capability) => capability.extension).sort()
  );
  assert.equal(skimCuratedFileExtensionSet.size, 114);
  assert.equal(skimDefaultFileExtensionSet.size, 102);
  assert.equal(indexableFileExtensionSet.size, 74);
  assert.equal(fileFormatCapabilityByExtension.has(".bld"), false);
  assert.equal(fileFormatCapabilityByExtension.has(".pr"), false);
  assert.equal(fileFormatCapabilityByExtension.get(".blend").iconName, "format-blend");
  assert.equal(fileFormatCapabilityByExtension.get(".prproj").iconName, "format-prproj");
  assert.equal(fileFormatCapabilityByExtension.get(".pproj").iconName, "format-prproj");
  assert.equal(skimDefaultFileExtensionSet.has(".ini"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".dll"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".mp4"), true);
  assert.equal(indexableFileExtensionSet.has(".avif"), false);
  assert.equal(indexableFileExtensionSet.has(".blend"), true);
  assert.equal(isSupportedImageFilePath("C:\\asset.png"), true);
  assert.equal(isSupportedImageFilePath("C:\\notes.txt"), false);
  assert.equal(isSupportedImageFilePath("C:\\document.docx"), false);

  const iconDirectory = path.join(__dirname, "..", "src", "renderer", "assets", "icons");
  for (const capability of fileFormatCapabilities.filter((capability) => capability.iconName !== "skim-file")) {
    assert.equal(fs.existsSync(path.join(iconDirectory, `${capability.iconName}.svg`)), true, capability.iconName);
  }

  console.log(JSON.stringify({
    centralCapabilitiesUnique: true,
    browseOnlyFormatsExcludedFromFormalIndex: true,
    visualSearchBoundaryPreserved: true,
    nonVisualSearchEnabled: true,
    formalVisualScannerBoundaryPreserved: true,
    skimCuratedFormatCount: skimCuratedFileExtensionSet.size,
    skimDefaultFormatCount: skimDefaultFileExtensionSet.size,
    formatIconsVerified: fileFormatCapabilities.filter((capability) => capability.iconName !== "skim-file").length
  }));
})().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
