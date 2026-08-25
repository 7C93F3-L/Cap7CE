import { fileFormatCapabilities, getFileFormatCapability, type NaturalFileKind } from "./formatCapabilities";
import { toSearchTerms } from "./searchPathEvidence";
import {
  getVisualPropertySemanticCondition,
  matchesVisualPropertyCondition,
  type VisualPropertySemanticCondition
} from "./visualPropertySemantics";
import type { VisualPropertyVector } from "./visualPropertyTypes";

export type NaturalSearchCondition =
  | { type: "fileKind"; kind: NaturalFileKind }
  | { type: "modifiedTime"; startMs: number; endMs: number }
  | { type: "orientation"; orientation: "landscape" | "portrait" | "square" }
  | { type: "aspectRatio"; width: number; height: number }
  | { type: "animation" }
  | VisualPropertySemanticCondition;

export interface PlannedSearchTerm {
  term: string;
  conditions: NaturalSearchCondition[];
}

export interface SearchQueryPlan {
  terms: PlannedSearchTerm[];
}

export interface NaturalConditionCandidate {
  extension: string;
  modifiedAt?: string | number;
  imageWidth?: number;
  imageHeight?: number;
  visualProperties?: VisualPropertyVector | null;
  isAnimated?: boolean;
}

const fileKindAliases = new Map<string, NaturalFileKind>([
  ["图片", "image"], ["图像", "image"],
  ["矢量图", "vector"], ["矢量", "vector"],
  ["源文件", "designSource"], ["原文件", "designSource"], ["设计稿", "designSource"],
  ["视频", "video"],
  ["音频", "audio"], ["音乐", "audio"], ["声音", "audio"],
  ["文档", "document"],
  ["文本", "text"],
  ["数据", "data"],
  ["压缩包", "archive"],
  ["字体", "font"],
  ["3d", "threeD"], ["三维", "threeD"],
  ["模型", "model"],
  ["word", "wordDocument"],
  ["excel", "excelWorkbook"],
  ["表格", "spreadsheet"],
  ["powerpoint", "powerpointPresentation"],
  ["幻灯片", "presentation"],
  ["ps文件", "photoshopSource"]
]);

const orientationAliases = new Map<string, "landscape" | "portrait" | "square">([
  ["横图", "landscape"], ["横向", "landscape"],
  ["横版", "landscape"],
  ["竖图", "portrait"], ["竖向", "portrait"],
  ["竖版", "portrait"],
  ["方图", "square"]
]);

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addLocalDays = (value: Date, days: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
const startOfLocalMonth = (year: number, monthIndex: number) => new Date(year, monthIndex, 1);

const createLocalDateRange = (year: number, monthIndex: number, day: number): NaturalSearchCondition | null => {
  const start = new Date(year, monthIndex, day);
  if (start.getFullYear() !== year || start.getMonth() !== monthIndex || start.getDate() !== day) return null;
  return { type: "modifiedTime", startMs: start.getTime(), endMs: addLocalDays(start, 1).getTime() };
};

const getExplicitModifiedTimeCondition = (term: string, referenceNow: Date): NaturalSearchCondition | null => {
  const absoluteChineseDate = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/u.exec(term);
  if (absoluteChineseDate) {
    const year = Number(absoluteChineseDate[1]);
    if (year < 1000 || year > 9999) return null;
    return createLocalDateRange(year, Number(absoluteChineseDate[2]) - 1, Number(absoluteChineseDate[3]));
  }

  const absoluteMonth = /^(\d{4})年(\d{1,2})月$/u.exec(term);
  if (absoluteMonth) {
    const year = Number(absoluteMonth[1]);
    const monthIndex = Number(absoluteMonth[2]) - 1;
    if (year < 1000 || year > 9999 || monthIndex < 0 || monthIndex > 11) return null;
    const start = startOfLocalMonth(year, monthIndex);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: startOfLocalMonth(year, monthIndex + 1).getTime() };
  }

  const relativeMonth = /^(今年|去年)(\d{1,2})月$/u.exec(term);
  if (relativeMonth) {
    const monthIndex = Number(relativeMonth[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return null;
    const year = referenceNow.getFullYear() - (relativeMonth[1] === "去年" ? 1 : 0);
    const start = startOfLocalMonth(year, monthIndex);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: startOfLocalMonth(year, monthIndex + 1).getTime() };
  }

  const absoluteNumericDate = /^(\d{4})([/-])(\d{1,2})(?:\2(\d{1,2}))?$/u.exec(term);
  if (!absoluteNumericDate) return null;
  const year = Number(absoluteNumericDate[1]);
  const monthIndex = Number(absoluteNumericDate[3]) - 1;
  if (year < 1000 || year > 9999 || monthIndex < 0 || monthIndex > 11) return null;
  if (absoluteNumericDate[4]) {
    return createLocalDateRange(year, monthIndex, Number(absoluteNumericDate[4]));
  }
  const start = startOfLocalMonth(year, monthIndex);
  return { type: "modifiedTime", startMs: start.getTime(), endMs: startOfLocalMonth(year, monthIndex + 1).getTime() };
};

const getModifiedTimeCondition = (term: string, referenceNow: Date): NaturalSearchCondition | null => {
  const explicitCondition = getExplicitModifiedTimeCondition(term, referenceNow);
  if (explicitCondition) return explicitCondition;
  const today = startOfLocalDay(referenceNow);
  if (term === "今天" || term === "今日" || term === "today" || term === "刚刚" || term === "刚才") {
    return { type: "modifiedTime", startMs: today.getTime(), endMs: addLocalDays(today, 1).getTime() };
  }
  if (term === "昨天" || term === "yesterday") {
    return { type: "modifiedTime", startMs: addLocalDays(today, -1).getTime(), endMs: today.getTime() };
  }
  if (term === "本周" || term === "这周" || term === "这星期") {
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = addLocalDays(today, -mondayOffset);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: addLocalDays(start, 7).getTime() };
  }
  if (term === "上周" || term === "上星期" || term === "上礼拜") {
    const mondayOffset = (today.getDay() + 6) % 7;
    const end = addLocalDays(today, -mondayOffset);
    return { type: "modifiedTime", startMs: addLocalDays(end, -7).getTime(), endMs: end.getTime() };
  }
  if (term === "本月" || term === "这个月") {
    const start = new Date(referenceNow.getFullYear(), referenceNow.getMonth(), 1);
    const end = new Date(referenceNow.getFullYear(), referenceNow.getMonth() + 1, 1);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: end.getTime() };
  }
  if (term === "上月" || term === "上个月") {
    const start = new Date(referenceNow.getFullYear(), referenceNow.getMonth() - 1, 1);
    const end = new Date(referenceNow.getFullYear(), referenceNow.getMonth(), 1);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: end.getTime() };
  }
  if (term === "今年") {
    const start = new Date(referenceNow.getFullYear(), 0, 1);
    const end = new Date(referenceNow.getFullYear() + 1, 0, 1);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: end.getTime() };
  }
  if (term === "去年") {
    const start = new Date(referenceNow.getFullYear() - 1, 0, 1);
    const end = new Date(referenceNow.getFullYear(), 0, 1);
    return { type: "modifiedTime", startMs: start.getTime(), endMs: end.getTime() };
  }
  if (term === "前不久" || term === "不久前") {
    return { type: "modifiedTime", startMs: addLocalDays(today, -29).getTime(), endMs: addLocalDays(today, 1).getTime() };
  }
  if (term === "前段时间") {
    return { type: "modifiedTime", startMs: addLocalDays(today, -179).getTime(), endMs: addLocalDays(today, 1).getTime() };
  }
  if (term === "很久前" || term === "很久以前") {
    return { type: "modifiedTime", startMs: 0, endMs: addLocalDays(today, -365).getTime() };
  }
  return null;
};

const greatestCommonDivisor = (left: number, right: number): number => (
  right === 0 ? left : greatestCommonDivisor(right, left % right)
);

const parseAspectRatio = (term: string): NaturalSearchCondition | null => {
  const match = /^(\d{1,5}):(\d{1,5})$/u.exec(term);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  const divisor = greatestCommonDivisor(width, height);
  return { type: "aspectRatio", width: width / divisor, height: height / divisor };
};

const planTerm = (term: string, referenceNow: Date): PlannedSearchTerm => {
  const conditions: NaturalSearchCondition[] = [];
  const fileKind = fileKindAliases.get(term);
  if (fileKind) conditions.push({ type: "fileKind", kind: fileKind });
  const modifiedTime = getModifiedTimeCondition(term, referenceNow);
  if (modifiedTime) conditions.push(modifiedTime);
  const orientation = orientationAliases.get(term);
  if (orientation) conditions.push({ type: "orientation", orientation });
  const aspectRatio = parseAspectRatio(term);
  if (aspectRatio) conditions.push(aspectRatio);
  const visualProperty = getVisualPropertySemanticCondition(term);
  if (visualProperty) conditions.push(visualProperty);
  if (term === "动图") conditions.push({ type: "animation" });
  return { term, conditions };
};

export const planSearchQuery = (query: string, referenceNow = new Date()): SearchQueryPlan => ({
  terms: toSearchTerms(query).map((term) => planTerm(term, referenceNow))
});

export const getSearchableExtensionsForNaturalKind = (kind: NaturalFileKind): string[] => (
  fileFormatCapabilities
    .filter((capability) => capability.canSearch && capability.naturalSearchKinds.includes(kind))
    .map((capability) => capability.extension)
);

export const matchesNaturalSearchCondition = (
  candidate: NaturalConditionCandidate,
  condition: NaturalSearchCondition
): boolean => {
  if (condition.type === "fileKind") {
    return getFileFormatCapability(candidate.extension)?.naturalSearchKinds.includes(condition.kind) === true;
  }
  if (condition.type === "modifiedTime") {
    const modifiedMs = typeof candidate.modifiedAt === "number"
      ? candidate.modifiedAt
      : new Date(candidate.modifiedAt ?? "").getTime();
    return Number.isFinite(modifiedMs) && modifiedMs >= condition.startMs && modifiedMs < condition.endMs;
  }
  if (condition.type === "visualProperty") {
    return matchesVisualPropertyCondition(candidate.visualProperties, condition);
  }
  if (condition.type === "animation") return candidate.isAnimated === true;
  const width = candidate.imageWidth ?? 0;
  const height = candidate.imageHeight ?? 0;
  if (width <= 0 || height <= 0) return false;
  if (condition.type === "orientation") {
    if (condition.orientation === "landscape") return width > height;
    if (condition.orientation === "portrait") return height > width;
    return width === height;
  }
  return width * condition.height === height * condition.width;
};

export const matchesAnyNaturalSearchCondition = (
  candidate: NaturalConditionCandidate,
  plannedTerm: PlannedSearchTerm
) => plannedTerm.conditions.some((condition) => matchesNaturalSearchCondition(candidate, condition));
