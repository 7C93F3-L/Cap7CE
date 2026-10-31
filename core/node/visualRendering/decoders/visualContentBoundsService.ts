import sharp from "sharp";

export interface VisualContentCropResult {
  buffer: Buffer;
  cropped: boolean;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

const analysisMaxDimension = 512;
const transparentAlphaThreshold = 16;
const transparentBorderRatio = 0.5;
const minimumWhiteBorderRatio = 0.2;
const whiteChannelMinimum = 235;
const whiteChannelSpreadMaximum = 18;
const backgroundDistanceThreshold = 20;
const minimumRetainedAreaRatio = 0.05;
const maximumRetainedAreaRatio = 0.96;
const safeMarginRatio = 0.02;

const isNearWhite = (red: number, green: number, blue: number) => (
  Math.min(red, green, blue) >= whiteChannelMinimum
  && Math.max(red, green, blue) - Math.min(red, green, blue) <= whiteChannelSpreadMaximum
);

const getBorderPixelIndexes = (width: number, height: number) => {
  const indexes: number[] = [];
  const thickness = Math.min(2, Math.ceil(Math.min(width, height) / 2));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x < thickness
        || y < thickness
        || x >= width - thickness
        || y >= height - thickness
      ) {
        indexes.push((y * width + x) * 4);
      }
    }
  }
  return indexes;
};

const findContentBounds = (
  data: Buffer,
  width: number,
  height: number
) => {
  const borderIndexes = getBorderPixelIndexes(width, height);
  const transparentBorderPixels = borderIndexes.filter(
    (index) => data[index + 3] < transparentAlphaThreshold
  ).length;
  const useTransparency = (
    transparentBorderPixels / borderIndexes.length >= transparentBorderRatio
  );

  let backgroundRed = 255;
  let backgroundGreen = 255;
  let backgroundBlue = 255;
  if (!useTransparency) {
    let whiteRedTotal = 0;
    let whiteGreenTotal = 0;
    let whiteBlueTotal = 0;
    let whitePixels = 0;
    for (const index of borderIndexes) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      if (data[index + 3] >= transparentAlphaThreshold && isNearWhite(red, green, blue)) {
        whiteRedTotal += red;
        whiteGreenTotal += green;
        whiteBlueTotal += blue;
        whitePixels += 1;
      }
    }
    if (whitePixels / borderIndexes.length < minimumWhiteBorderRatio) {
      return null;
    }
    backgroundRed = whiteRedTotal / whitePixels;
    backgroundGreen = whiteGreenTotal / whitePixels;
    backgroundBlue = whiteBlueTotal / whitePixels;
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const isContent = useTransparency
        ? alpha >= transparentAlphaThreshold
        : (
          alpha >= transparentAlphaThreshold
          && Math.max(
            Math.abs(data[index] - backgroundRed),
            Math.abs(data[index + 1] - backgroundGreen),
            Math.abs(data[index + 2] - backgroundBlue)
          ) > backgroundDistanceThreshold
        );
      if (!isContent) {
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }
  return { left, top, right, bottom };
};

export const cropVisualContent = async (
  buffer: Buffer
): Promise<VisualContentCropResult> => {
  const sourceMetadata = await sharp(buffer).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error("无法读取代表图尺寸。");
  }
  const sourceWidth = sourceMetadata.width;
  const sourceHeight = sourceMetadata.height;
  const analysis = await sharp(buffer)
    .resize({
      width: analysisMaxDimension,
      height: analysisMaxDimension,
      fit: "inside",
      withoutEnlargement: true
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bounds = findContentBounds(
    analysis.data,
    analysis.info.width,
    analysis.info.height
  );
  if (!bounds) {
    return {
      buffer,
      cropped: false,
      sourceWidth,
      sourceHeight,
      outputWidth: sourceWidth,
      outputHeight: sourceHeight
    };
  }

  const scaleX = sourceWidth / analysis.info.width;
  const scaleY = sourceHeight / analysis.info.height;
  let left = Math.floor(bounds.left * scaleX);
  let top = Math.floor(bounds.top * scaleY);
  let right = Math.ceil((bounds.right + 1) * scaleX);
  let bottom = Math.ceil((bounds.bottom + 1) * scaleY);
  const contentWidth = right - left;
  const contentHeight = bottom - top;
  const horizontalMargin = Math.max(2, Math.round(contentWidth * safeMarginRatio));
  const verticalMargin = Math.max(2, Math.round(contentHeight * safeMarginRatio));
  left = Math.max(0, left - horizontalMargin);
  top = Math.max(0, top - verticalMargin);
  right = Math.min(sourceWidth, right + horizontalMargin);
  bottom = Math.min(sourceHeight, bottom + verticalMargin);

  const outputWidth = right - left;
  const outputHeight = bottom - top;
  const retainedAreaRatio = (
    (outputWidth * outputHeight) / (sourceWidth * sourceHeight)
  );
  if (
    retainedAreaRatio < minimumRetainedAreaRatio
    || retainedAreaRatio > maximumRetainedAreaRatio
  ) {
    return {
      buffer,
      cropped: false,
      sourceWidth,
      sourceHeight,
      outputWidth: sourceWidth,
      outputHeight: sourceHeight
    };
  }

  return {
    buffer: await sharp(buffer)
      .extract({
        left,
        top,
        width: outputWidth,
        height: outputHeight
      })
      .png()
      .toBuffer(),
    cropped: true,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight
  };
};
