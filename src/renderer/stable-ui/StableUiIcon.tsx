import type { SortDirection } from "../../shared/types";
import aiEnhanceIcon from "../assets/icons/icon-stable-ai-enhance.svg?raw";
import aiEnhanceActiveIcon from "../assets/icons/icon-stable-ai-enhance-active.svg?raw";
import folderIcon from "../assets/icons/icon-stable-folder.svg?raw";
import folderSelectedIcon from "../assets/icons/icon-stable-folder-selected.svg?raw";
import scopeIcon from "../assets/icons/icon-stable-search-scope.svg?raw";
import scopeActiveIcon from "../assets/icons/icon-stable-search-scope-active.svg?raw";
import searchIcon from "../assets/icons/icon-stable-search.svg?raw";
import settingsIcon from "../assets/icons/icon-stable-settings.svg?raw";
import settingsActiveIcon from "../assets/icons/icon-stable-settings-active.svg?raw";
import skimIcon from "../assets/icons/icon-stable-skim.svg?raw";
import skimActiveIcon from "../assets/icons/icon-stable-skim-active.svg?raw";
import sortAscIcon from "../assets/icons/icon-sort-asc.svg?raw";
import sortDescIcon from "../assets/icons/icon-sort-desc.svg?raw";
import SvgIcon from "../components/SvgIcon";

export type StableUiIconName = "ai" | "folder" | "scope" | "search" | "settings" | "skim" | "sort";

const StableUiIcon = ({ name, active = false, sortDirection = "asc", className = "cap-stable-sidebar-icon" }: {
  name: StableUiIconName;
  active?: boolean;
  sortDirection?: SortDirection;
  className?: string;
}) => {
  const svg = name === "ai" ? (active ? aiEnhanceActiveIcon : aiEnhanceIcon)
    : name === "folder" ? (active ? folderSelectedIcon : folderIcon)
      : name === "scope" ? (active ? scopeActiveIcon : scopeIcon)
        : name === "settings" ? (active ? settingsActiveIcon : settingsIcon)
          : name === "skim" ? (active ? skimActiveIcon : skimIcon)
            : name === "sort" ? (sortDirection === "asc" ? sortAscIcon : sortDescIcon)
              : searchIcon;
  return <SvgIcon svg={svg} className={`cap-svg-icon ${className}`} />;
};

export default StableUiIcon;
