import { t } from "../../../electron/localization";
import type { ImageSearchResponse, SearchState } from "../../shared/types";

const ResultStatus = ({
  search,
  resultCount,
  searchStatus,
  isSearching
}: {
  search: SearchState;
  resultCount: number;
  searchStatus: ImageSearchResponse;
  isSearching: boolean;
}) => {
  const hasSearchTerms = search.query.trim().length > 0;
  if (isSearching) return t("search.searching");
  if (search.recognitionStatus === "unrecognized") {
    return (
      <span className="unrecognized-status">
        <span>{t("search.unrecognizedCount", { count: searchStatus.unrecognizedCount })}</span>
        <span>{t("search.parseFailureCount", { count: searchStatus.failureStats.parseFailures })}</span>
        <span>{t("search.fileFailureCount", { count: searchStatus.failureStats.fileFailures })}</span>
      </span>
    );
  }
  if (search.recognitionStatus === "recognized") return t("search.recognizedCount", { count: resultCount });
  if (hasSearchTerms && searchStatus.skippedUnrecognizedCount > 0) {
    return t("search.skippedUnrecognized", { count: resultCount, skippedCount: searchStatus.skippedUnrecognizedCount });
  }
  if (!hasSearchTerms && searchStatus.unrecognizedCount > 0) {
    return (
      <span className="unrecognized-status">
        <span>{t("search.allFileCount", { count: resultCount })}</span>
        <span>{t("search.unrecognizedCount", { count: searchStatus.unrecognizedCount })}</span>
      </span>
    );
  }
  return t("search.resultCount", { count: resultCount });
};

export default ResultStatus;
