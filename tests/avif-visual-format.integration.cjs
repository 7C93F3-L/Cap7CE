const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-avif-visual-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const sourcePath = path.join(testRoot, "sample.avif");
const corruptPath = path.join(testRoot, "corrupt.avif");

app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const {
    ensureModelInputImagePath,
    ensurePreviewImagePath,
    ensureSearchThumbnailPath,
    ensureSkimPreviewPath,
    ensureSkimThumbnailPath,
    releaseVisualRenderFileHandles
  } = require("../dist-electron/visualRenderService.js");
  const { readVisualCacheImage } = require("../dist-electron/visualCacheService.js");
  const { isSupportedImageFilePath } = require("../dist-electron/imageScanner.js");

  try {
    await fs.mkdir(testRoot, { recursive: true });
    await sharp({
      create: {
        width: 96,
        height: 72,
        channels: 4,
        background: { r: 48, g: 128, b: 224, alpha: 0.75 }
      }
    }).avif({ quality: 80 }).toFile(sourcePath);
    await fs.writeFile(corruptPath, "not an AVIF image");

    assert.equal(isSupportedImageFilePath(sourcePath), true);
    const sourceMetadata = await sharp(sourcePath).metadata();
    assert.equal(sourceMetadata.format, "heif");

    const [thumbnailPath, previewPath, modelInputPath, skimThumbnailPath, skimPreviewPath] = await Promise.all([
      ensureSearchThumbnailPath(sourcePath),
      ensurePreviewImagePath(sourcePath),
      ensureModelInputImagePath(sourcePath),
      ensureSkimThumbnailPath(sourcePath),
      ensureSkimPreviewPath(sourcePath)
    ]);
    const [thumbnail, preview, modelInput, skimThumbnail, skimPreview] = await Promise.all([
      readVisualCacheImage(thumbnailPath),
      readVisualCacheImage(previewPath),
      readVisualCacheImage(modelInputPath),
      readVisualCacheImage(skimThumbnailPath),
      readVisualCacheImage(skimPreviewPath)
    ]);
    assert.equal(thumbnail.mimeType, "image/png");
    assert.equal(preview.mimeType, "image/png");
    assert.equal(modelInput.mimeType, "image/jpeg");
    assert.equal(skimThumbnail.mimeType, "image/png");
    assert.equal(skimPreview.mimeType, "image/png");
    assert.deepEqual(
      await Promise.all([thumbnail, preview, modelInput, skimThumbnail, skimPreview].map(async (image) => {
        const metadata = await sharp(image.buffer).metadata();
        return [metadata.width, metadata.height];
      })),
      [[96, 72], [96, 72], [96, 72], [96, 72], [96, 72]]
    );
    await assert.rejects(() => ensureSearchThumbnailPath(corruptPath));

    console.log(JSON.stringify({
      avifRecognizedAsFormalVisual: true,
      searchThumbnailRendered: true,
      previewRendered: true,
      modelInputRendered: true,
      skimCachesRendered: true,
      corruptAvifRejected: true
    }));
  } finally {
    releaseVisualRenderFileHandles();
    await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
