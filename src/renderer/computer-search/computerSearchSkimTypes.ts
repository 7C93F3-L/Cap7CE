import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";
import type { StableSkimSlotProps } from "../stable-ui/stableSkimTypes";

export type ComputerSearchSkimSlotProps = StableSkimSlotProps & {
  conditions?: ComputerSearchConditions;
  onSearchExit?: () => void;
  invalidFilters?: boolean;
};
