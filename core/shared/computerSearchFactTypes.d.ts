// User-selected scalar conditions. Extractor versions belong to the main process.
export interface ComputerSearchRatio { numerator: number; denominator: number }
export interface ComputerSearchIntegerRange { minimum?: number; maximum?: number }
export interface ComputerSearchVisualConstraint { metric: string; operator: ">" | "<="; value: number }
export interface ComputerSearchVisualGroup { alternatives: ComputerSearchVisualConstraint[][] }
export interface ComputerSearchAspectRange {
  minimum?: ComputerSearchRatio;
  maximum?: ComputerSearchRatio;
  minimumInclusive?: boolean;
  maximumInclusive?: boolean;
}
export interface ComputerSearchFileConditions {
  extensions?: string[];
  excludedExtensions?: string[];
  minimumSizeBytes?: number;
  maximumSizeBytes?: number;
  minimumModifiedFileTime?: string;
  maximumModifiedFileTime?: string;
}
export interface ComputerSearchFacts {
  kind: "image-dimensions" | "video" | "audio" | "font" | "model" | "document" | "three-d" | "text-data" | "archive";
  minimumWidth?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  maximumHeight?: number;
  minimumDurationMilliseconds?: number;
  maximumDurationMilliseconds?: number;
  minimumAspectRatio?: ComputerSearchRatio;
  maximumAspectRatio?: ComputerSearchRatio;
  aspectRanges?: ComputerSearchAspectRange[];
  shortEdgeRanges?: ComputerSearchIntegerRange[];
  channelRanges?: ComputerSearchIntegerRange[];
  font?: import("./computerSearchFontTypes").ComputerSearchFontFilter;
  model?: import("./computerSearchModelTypes").ComputerSearchModelFilter;
  document?: import("./computerSearchDocumentTypes").ComputerSearchDocumentFilter;
  threeD?: import("./computerSearchThreeDTypes").ComputerSearchThreeDFilter;
  textData?: import("./computerSearchTextDataTypes").ComputerSearchTextDataFilter;
  archive?: import("./computerSearchArchiveTypes").ComputerSearchArchiveFilter;
  isAnimated?: boolean;
  visualGroups?: ComputerSearchVisualGroup[];
}
export type ComputerSearchSort = "name-ascending" | "name-descending" | "modified-ascending" | "modified-descending";
export interface ComputerSearchViewOptions { sort?: ComputerSearchSort; excludeHidden?: boolean; includeSubfolders?: boolean; randomSeed?: number }
export interface ComputerSearchConditions { facts?: ComputerSearchFacts; fileConditions?: ComputerSearchFileConditions }
