import type { ImageIndexItem } from "../../shared/types";

export type DroppedDirectory = {
  name: string;
  path: string;
};

export type KeywordEditSession = {
  mode: "single" | "multi";
  items: ImageIndexItem[];
  initialCommonKeywords: string[];
};

export type DeleteFilesFeedback = {
  status: "failed" | "succeeded";
  failedCount: number;
  message: string;
};

export type CacheClearFeedback = {
  status: "failed" | "succeeded";
  message: string;
};
