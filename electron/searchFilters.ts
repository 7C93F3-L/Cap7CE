export type SearchTimePreset = "week" | "month" | "year" | "last-year" | "older" | "all" | "custom";

export interface SearchModifiedTimeRange {
  startMs: number;
  endMs: number;
}

export const searchVisualColors = [
  "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink",
  "black-background", "gray-tone", "white-background", "transparent-background"
] as const;
export type SearchVisualColor = typeof searchVisualColors[number];

export const searchImageAspectRatios = ["portrait", "landscape", "square", "wide", "tall"] as const;
export type SearchImageAspectRatio = typeof searchImageAspectRatios[number];

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addLocalDays = (value: Date, days: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

export const resolveSearchModifiedTimeRange = (
  preset: SearchTimePreset | undefined,
  customRange: SearchModifiedTimeRange | undefined,
  referenceNow = new Date()
): SearchModifiedTimeRange | null => {
  if (!preset || preset === "all") return null;
  if (preset === "custom") {
    return customRange
      && Number.isFinite(customRange.startMs)
      && Number.isFinite(customRange.endMs)
      && customRange.startMs >= 0
      && customRange.endMs > customRange.startMs
      ? customRange
      : null;
  }
  const year = referenceNow.getFullYear();
  if (preset === "last-year") return { startMs: new Date(year - 1, 0, 1).getTime(), endMs: new Date(year, 0, 1).getTime() };
  if (preset === "older") return { startMs: 0, endMs: new Date(year - 1, 0, 1).getTime() };
  if (preset === "year") return { startMs: new Date(year, 0, 1).getTime(), endMs: new Date(year + 1, 0, 1).getTime() };
  if (preset === "month") return { startMs: new Date(year, referenceNow.getMonth(), 1).getTime(), endMs: new Date(year, referenceNow.getMonth() + 1, 1).getTime() };
  const today = startOfLocalDay(referenceNow);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addLocalDays(today, -mondayOffset);
  return { startMs: start.getTime(), endMs: addLocalDays(start, 7).getTime() };
};
