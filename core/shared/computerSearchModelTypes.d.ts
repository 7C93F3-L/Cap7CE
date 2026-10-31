import type { ModelPrecision } from "../../core/node/fileFacts/domain/modelFactTypes";
export interface ComputerSearchModelFilter {
  parameterRanges?: { minimum?: number; maximum?: number }[];
  precisions?: ModelPrecision[];
}
