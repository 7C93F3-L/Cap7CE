import type { TranslationKey } from "../../../electron/localization";
import type { SearchImageAspectRatio, SearchImageAspectRatioValue, SearchImageColorTrait, SearchImageDimensionFilter, SearchVisualColor } from "../../../electron/imageSearchFilters";

export const colorLabels: Record<SearchVisualColor, TranslationKey> = {
  red: "explore.color.red", orange: "explore.color.orange", yellow: "explore.color.yellow", green: "explore.color.green",
  cyan: "explore.color.cyan", blue: "explore.color.blue", purple: "explore.color.purple", pink: "explore.color.pink",
  "black-background": "explore.color.black", "gray-tone": "explore.color.gray", "white-background": "explore.color.white", "transparent-background": "explore.color.transparent"
};
export const colorTraitLabels: Record<SearchImageColorTrait, TranslationKey> = {
  "bright-image": "explore.color.bright", "dark-image": "explore.color.dark", "vivid-image": "explore.color.vivid", "muted-image": "explore.color.muted"
};
export const ratioLabels: Record<SearchImageAspectRatio, TranslationKey> = {
  portrait: "explore.ratio.portrait", landscape: "explore.ratio.landscape", square: "explore.ratio.square", wide: "explore.ratio.wide", tall: "explore.ratio.tall"
};
export const commonAspectRatios: SearchImageAspectRatioValue[] = [
  { width: 1, height: 1 }, { width: 4, height: 3 }, { width: 3, height: 4 }, { width: 3, height: 2 }, { width: 2, height: 3 },
  { width: 16, height: 9 }, { width: 9, height: 16 }, { width: 4, height: 5 }, { width: 5, height: 4 }
];
export const ratioValueKey = ({ width, height }: SearchImageAspectRatioValue) => `${width}:${height}`;
export const toggleValue = <T extends string>(current: readonly T[], value: T) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
export const toggleRatioValue = (current: readonly SearchImageAspectRatioValue[], value: SearchImageAspectRatioValue) => current.some((item) => ratioValueKey(item) === ratioValueKey(value))
  ? current.filter((item) => ratioValueKey(item) !== ratioValueKey(value)) : [...current, value];
export const formatDimensionSummary = (filter: SearchImageDimensionFilter | undefined) => {
  if (!filter) return "—";
  if (filter.mode === "exact") return `${filter.width} × ${filter.height}`;
  const width = `${filter.minWidth ? `≥${filter.minWidth}` : "—"}${filter.maxWidth ? ` ≤${filter.maxWidth}` : ""}`;
  const height = `${filter.minHeight ? `≥${filter.minHeight}` : "—"}${filter.maxHeight ? ` ≤${filter.maxHeight}` : ""}`;
  return `W ${width} · H ${height}`;
};
