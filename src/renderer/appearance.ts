import type { AppearanceColors } from "../shared/types";

export const defaultAppearanceColors: AppearanceColors = {
  themeColor: "#7C93F3",
  accentColor: "#68C3C0"
};

export const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export const getTextColorForBackground = (...colors: string[]) => {
  const validColors = colors.filter(isHexColor);
  if (validColors.length === 0) return "#191919";
  const [red, green, blue] = validColors.reduce((channels, color) => [
    channels[0] + Number.parseInt(color.slice(1, 3), 16),
    channels[1] + Number.parseInt(color.slice(3, 5), 16),
    channels[2] + Number.parseInt(color.slice(5, 7), 16)
  ], [0, 0, 0]).map((channel) => channel / validColors.length);
  const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
  return brightness > 160 ? "#191919" : "#ffffff";
};
