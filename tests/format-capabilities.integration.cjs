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

  const formalVisualCapabilities = fileFormatCapabilities.filter((capability) => capability.canAIIndex);
  const searchableFileCapabilities = fileFormatCapabilities.filter((capability) => !capability.canAIIndex);
  assert.equal(formalVisualCapabilities.length, 15);
  assert.equal(searchableFileCapabilities.length, 108);
  assert.equal(fileFormatCapabilities.every((capability) => capability.canIndex && capability.canSearch), true);
  assert.equal(formalVisualCapabilities.every((capability) => (
    capability.canSearch
    && capability.canThumbnail
    && capability.previewKind === (capability.extension === ".pdf" ? "pdf" : "image")
    && capability.canAIIndex
  )), true);
  assert.equal(formalVisualCapabilities.filter((capability) => capability.canDirectPreview).length, 7);
  assert.equal(searchableFileCapabilities.every((capability) => (
    capability.canSearch
    && !capability.canThumbnail
    && !capability.canDirectPreview
    && !capability.canAIIndex
  )), true);
  assert.deepEqual(
    Object.fromEntries([
      ".txt", ".md", ".ini", ".html", ".css", ".js", ".py", ".csv", ".json", ".xml", ".yaml", ".yml",
      ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".epub", ".mobi", ".7z", ".rar", ".zip", ".otf", ".ttf",
      ".pdf", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".mkv", ".mp4", ".mov", ".webm"
    ].map((extension) => [
      extension,
      fileFormatCapabilityByExtension.get(extension).previewKind
    ])),
    {
      ".txt": "text", ".md": "text", ".ini": "text", ".html": "text",
      ".css": "text", ".js": "text", ".py": "text",
      ".csv": "text", ".json": "text", ".xml": "text", ".yaml": "text", ".yml": "text",
      ".doc": "text", ".docx": "text",
      ".xls": "office", ".xlsx": "office", ".ppt": "office", ".pptx": "office", ".epub": "epub", ".mobi": "mobi",
      ".7z": "archive", ".rar": "archive", ".zip": "archive",
      ".otf": "font", ".ttf": "font",
      ".pdf": "pdf",
      ".flac": "audio", ".m4a": "audio", ".mp3": "audio", ".ogg": "audio", ".wav": "audio",
      ".mkv": "video", ".mp4": "video", ".mov": "video", ".webm": "video"
    }
  );
  assert.equal(searchableFileCapabilities.filter((capability) => capability.previewKind === "fileInfo").length, 74);
  assert.deepEqual(
    [...supportedVisualFileExtensionSet].sort(),
    formalVisualCapabilities.map((capability) => capability.extension).sort()
  );
  assert.equal(skimCuratedFileExtensionSet.size, 123);
  assert.equal(skimDefaultFileExtensionSet.size, 55);
  assert.equal(indexableFileExtensionSet.size, 123);
  assert.equal(indexableFileExtensionSet.has(".epub"), true);
  assert.equal(indexableFileExtensionSet.has(".mobi"), true);
  assert.equal(indexableFileExtensionSet.has(".css"), true);
  assert.equal(indexableFileExtensionSet.has(".js"), true);
  assert.equal(indexableFileExtensionSet.has(".py"), true);
  assert.equal(fileFormatCapabilityByExtension.has(".bld"), false);
  assert.equal(fileFormatCapabilityByExtension.has(".pr"), false);
  assert.equal(fileFormatCapabilityByExtension.get(".blend").iconName, "format-blend");
  assert.equal(fileFormatCapabilityByExtension.get(".jpeg").iconName, "format-jpg");
  assert.equal(fileFormatCapabilityByExtension.get(".tiff").iconName, "format-tif");
  assert.equal(fileFormatCapabilityByExtension.get(".yml").iconName, "format-yaml");
  assert.equal(fileFormatCapabilityByExtension.get(".prproj").iconName, "format-prproj");
  assert.equal(fileFormatCapabilityByExtension.get(".pproj").iconName, "format-prproj");
  assert.equal(fileFormatCapabilityByExtension.get(".gguf").iconName, "format-model");
  assert.equal(fileFormatCapabilityByExtension.get(".safetensors").iconName, "format-model");
  for (const extension of [".3dm", ".iso", ".swf", ".gguf", ".safetensors"]) {
    const capability = fileFormatCapabilityByExtension.get(extension);
    assert.equal(capability.canBrowse, true, extension);
    assert.equal(capability.canIndex, true, extension);
    assert.equal(capability.canSearch, true, extension);
    assert.equal(capability.previewKind, "fileInfo", extension);
  }
  assert.equal(skimDefaultFileExtensionSet.has(".ini"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".iso"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".gguf"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".dll"), false);
  assert.equal(skimDefaultFileExtensionSet.has(".mp4"), true);
  assert.equal(indexableFileExtensionSet.has(".avif"), true);
  assert.equal(indexableFileExtensionSet.has(".blend"), true);
  assert.equal(isSupportedImageFilePath("C:\\asset.png"), true);
  assert.equal(isSupportedImageFilePath("C:\\asset.avif"), true);
  assert.equal(isSupportedImageFilePath("C:\\notes.txt"), false);
  assert.equal(isSupportedImageFilePath("C:\\document.docx"), false);

  const iconDirectory = path.join(__dirname, "..", "src", "renderer", "assets", "icons");
  for (const capability of fileFormatCapabilities) {
    assert.equal(fs.existsSync(path.join(iconDirectory, `${capability.iconName}.svg`)), true, capability.iconName);
  }

  console.log(JSON.stringify({
    centralCapabilitiesUnique: true,
    allRegisteredFormatsSearchable: true,
    visualSearchBoundaryPreserved: true,
    nonVisualSearchEnabled: true,
    formalVisualScannerBoundaryPreserved: true,
    skimCuratedFormatCount: skimCuratedFileExtensionSet.size,
    skimDefaultFormatCount: skimDefaultFileExtensionSet.size,
    formatIconsVerified: fileFormatCapabilities.length
  }));
})().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
