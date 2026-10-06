import type { ModelPrecision } from "../../electron/modelFactTypes";
export interface ComputerSearchModelFilter {
  parameterRanges?: { minimum?: number; maximum?: number }[];
  precisions?: ModelPrecision[];
}
