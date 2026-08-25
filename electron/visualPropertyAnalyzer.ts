import {
  VISUAL_PROPERTY_ANALYZER_VERSION,
  VISUAL_PROPERTY_RATIO_SCALE,
  visualColorFamilies,
  type VisualColorFamily,
  type VisualColorRatioMap,
  type VisualPropertyVector
} from "./visualPropertyTypes";

export interface RgbaVisualPropertyInput {
  data: Uint8Array;
  width: number;
  height: number;
}

export const MAXIMUM_VISUAL_PROPERTY_PIXELS = 300 * 300;

const transparentAlphaMaximum = 5;
const visibleAlphaMinimum = 25;
const opaqueAlphaMinimum = 250;

const toRatio = (count: number, denominator: number) => (
  denominator <= 0
    ? 0
    : Math.max(0, Math.min(VISUAL_PROPERTY_RATIO_SCALE, Math.round(
      count * VISUAL_PROPERTY_RATIO_SCALE / denominator
    )))
);

const toScaledValue = (value: number) => Math.max(
  0,
  Math.min(VISUAL_PROPERTY_RATIO_SCALE, Math.round(value * VISUAL_PROPERTY_RATIO_SCALE))
);

const createColorRatioMap = (): VisualColorRatioMap => ({
  red: 0,
  orange: 0,
  yellow: 0,
  green: 0,
  cyan: 0,
  blue: 0,
  purple: 0,
  pink: 0
});

const getColorFamily = (hue: number): VisualColorFamily => {
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 195) return "cyan";
  if (hue < 255) return "blue";
  if (hue < 290) return "purple";
  return "pink";
};

const getHueAndSaturation = (red: number, green: number, blue: number) => {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const saturation = maximum === 0 ? 0 : delta / maximum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation, value: maximum };
};

const assertInput = ({ data, width, height }: RgbaVisualPropertyInput) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Visual property input dimensions are invalid.");
  }
  const pixelCount = width * height;
  if (pixelCount > MAXIMUM_VISUAL_PROPERTY_PIXELS) {
    throw new Error(`Visual property input exceeds ${MAXIMUM_VISUAL_PROPERTY_PIXELS} pixels.`);
  }
  if (data.length !== pixelCount * 4) {
    throw new Error("Visual property input must contain exactly four RGBA channels per pixel.");
  }
};

export const analyzeVisualProperties = (input: RgbaVisualPropertyInput): VisualPropertyVector => {
  assertInput(input);
  const { data, width, height } = input;
  const pixelCount = width * height;
  const familyGrid = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const brightnessHistogram = new Uint32Array(256);
  const familyCounts = new Uint32Array(visualColorFamilies.length + 1);
  const largestFamilyBlocks = new Uint32Array(visualColorFamilies.length + 1);
  const familyIndex = new Map<VisualColorFamily, number>(
    visualColorFamilies.map((family, index) => [family, index + 1])
  );
  const borderX = Math.max(1, Math.round(width * 0.06));
  const borderY = Math.max(1, Math.round(height * 0.06));

  let transparentCount = 0;
  let semitransparentCount = 0;
  let visibleCount = 0;
  let brightnessSum = 0;
  let saturationSum = 0;
  let darkCount = 0;
  let highlightCount = 0;
  let highSaturationCount = 0;
  let lowSaturationCount = 0;
  let borderCount = 0;
  let borderVisibleCount = 0;
  let borderTransparentCount = 0;
  let borderWhiteCount = 0;
  let borderBlackCount = 0;
  let borderRedSum = 0;
  let borderGreenSum = 0;
  let borderBlueSum = 0;
  let borderRgbSquaredSum = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    const alpha = data[offset + 3];
    const x = index % width;
    const y = Math.floor(index / width);
    const isBorder = x < borderX || x >= width - borderX || y < borderY || y >= height - borderY;

    if (alpha <= transparentAlphaMaximum) transparentCount += 1;
    else if (alpha < opaqueAlphaMinimum) semitransparentCount += 1;
    if (isBorder) borderCount += 1;
    if (alpha <= visibleAlphaMinimum) {
      if (isBorder) borderTransparentCount += 1;
      continue;
    }

    visibleCount += 1;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const luminanceByte = Math.max(0, Math.min(255, Math.round(luminance * 255)));
    brightnessHistogram[luminanceByte] += 1;
    brightnessSum += luminance;
    if (luminance < 0.18) darkCount += 1;
    if (luminance > 0.88) highlightCount += 1;

    const color = getHueAndSaturation(red, green, blue);
    saturationSum += color.saturation;
    if (color.saturation > 0.58) highSaturationCount += 1;
    if (color.saturation < 0.12) lowSaturationCount += 1;
    if (color.saturation > 0.28 && color.value > 0.16) {
      const indexForFamily = familyIndex.get(getColorFamily(color.hue)) ?? 0;
      familyCounts[indexForFamily] += 1;
      familyGrid[index] = indexForFamily;
    }

    if (isBorder) {
      borderVisibleCount += 1;
      if (luminance > 0.9 && color.saturation < 0.15) borderWhiteCount += 1;
      if (luminance < 0.1) borderBlackCount += 1;
      borderRedSum += red;
      borderGreenSum += green;
      borderBlueSum += blue;
      borderRgbSquaredSum += red * red + green * green + blue * blue;
    }
  }

  let cumulativeBrightness = 0;
  let brightnessMedian = 0;
  for (let index = 0; index < brightnessHistogram.length; index += 1) {
    cumulativeBrightness += brightnessHistogram[index];
    if (cumulativeBrightness >= visibleCount / 2) {
      brightnessMedian = index / 255;
      break;
    }
  }

  for (let start = 0; start < pixelCount; start += 1) {
    const family = familyGrid[start];
    if (family === 0 || visited[start] === 1) continue;
    let head = 0;
    let tail = 1;
    let componentSize = 0;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++];
      componentSize += 1;
      const x = current % width;
      const above = current - width;
      const below = current + width;
      const left = current - 1;
      const right = current + 1;
      if (above >= 0 && visited[above] === 0 && familyGrid[above] === family) {
        visited[above] = 1;
        queue[tail++] = above;
      }
      if (below < pixelCount && visited[below] === 0 && familyGrid[below] === family) {
        visited[below] = 1;
        queue[tail++] = below;
      }
      if (x > 0 && visited[left] === 0 && familyGrid[left] === family) {
        visited[left] = 1;
        queue[tail++] = left;
      }
      if (x + 1 < width && visited[right] === 0 && familyGrid[right] === family) {
        visited[right] = 1;
        queue[tail++] = right;
      }
    }
    if (componentSize > largestFamilyBlocks[family]) largestFamilyBlocks[family] = componentSize;
  }

  const borderDenominator = Math.max(1, borderVisibleCount);
  const borderMeanRed = borderRedSum / borderDenominator;
  const borderMeanGreen = borderGreenSum / borderDenominator;
  const borderMeanBlue = borderBlueSum / borderDenominator;
  const borderVariance = Math.max(0, borderRgbSquaredSum / borderDenominator - (
    borderMeanRed * borderMeanRed
    + borderMeanGreen * borderMeanGreen
    + borderMeanBlue * borderMeanBlue
  ));
  const colorRatios = createColorRatioMap();
  const colorBlockRatios = createColorRatioMap();
  for (let index = 0; index < visualColorFamilies.length; index += 1) {
    const family = visualColorFamilies[index];
    colorRatios[family] = toRatio(familyCounts[index + 1], visibleCount);
    colorBlockRatios[family] = toRatio(largestFamilyBlocks[index + 1], visibleCount);
  }

  return {
    transparentRatio: toRatio(transparentCount, pixelCount),
    semitransparentRatio: toRatio(semitransparentCount, pixelCount),
    borderTransparentRatio: toRatio(borderTransparentCount, borderCount),
    brightnessMean: toScaledValue(visibleCount > 0 ? brightnessSum / visibleCount : 0),
    brightnessMedian: toScaledValue(brightnessMedian),
    darkRatio: toRatio(darkCount, visibleCount),
    highlightRatio: toRatio(highlightCount, visibleCount),
    saturationMean: toScaledValue(visibleCount > 0 ? saturationSum / visibleCount : 0),
    highSaturationRatio: toRatio(highSaturationCount, visibleCount),
    lowSaturationRatio: toRatio(lowSaturationCount, visibleCount),
    borderWhiteRatio: toRatio(borderWhiteCount, borderVisibleCount),
    borderBlackRatio: toRatio(borderBlackCount, borderVisibleCount),
    borderUniformity: borderVisibleCount > 0
      ? toScaledValue(1 - Math.min(1, Math.sqrt(borderVariance / 3) / 0.5))
      : 0,
    colorRatios,
    colorBlockRatios
  };
};

export { VISUAL_PROPERTY_ANALYZER_VERSION };
