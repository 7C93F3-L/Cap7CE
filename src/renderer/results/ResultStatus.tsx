import { t } from "../../../electron/localization";

const ResultStatus = ({
  resultCount,
  totalFileCount,
  hasActiveSearch,
  isSearching
}: {
  resultCount: number;
  totalFileCount: number | null;
  hasActiveSearch: boolean;
  isSearching: boolean;
}) => {
  if (isSearching) return t("search.searching");
  return hasActiveSearch
    ? t("search.resultCount", { count: resultCount })
    : t("search.fileCount", { count: totalFileCount ?? "…" });
};

export default ResultStatus;
