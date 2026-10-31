export interface ComputerSearchThreeDFilter {
  minimumTriangleCount?: number;
  maximumTriangleCount?: number;
  structures?: ("static" | "animated" | "rigged")[];
}
