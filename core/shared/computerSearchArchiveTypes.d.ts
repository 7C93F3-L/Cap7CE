export interface ComputerSearchArchiveFilter {
  minimumFileCount?: number;
  maximumFileCount?: number;
  contentTypes?: ("image" | "video" | "audio" | "document" | "project" | "threeD" | "program" | "other")[];
  structures?: ("flat" | "nested")[];
}
