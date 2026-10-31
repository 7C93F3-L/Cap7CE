import type { ComputerSearchIntegerRange } from "./computerSearchFactTypes";
export interface ComputerSearchFontFilter {
  weightRanges?: ComputerSearchIntegerRange[];
  italic?: boolean;
  supportsLatin?: boolean;
  supportsChinese?: boolean;
  variable?: boolean;
}
