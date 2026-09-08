import { t } from "../../../electron/localization";

const ResultStatus = ({
  resultCount,
  fileCount,
  hasActiveSearch,
  isSearching
}: {
  resultCount: number;
  fileCount: number | null;
  hasActiveSearch: boolean;
  isSearching: boolean;
}) => {
  if (isSearching) return t("search.searching");
  return hasActiveSearch
    ? t("search.resultCount", { count: resultCount })
    : t("search.fileCount", { count: fileCount ?? "…" });
};

export default ResultStatus;
