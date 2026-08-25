import { t } from "../../../electron/localization";

const ResultStatus = ({
  resultCount,
  isSearching
}: {
  resultCount: number;
  isSearching: boolean;
}) => {
  if (isSearching) return t("search.searching");
  return t("search.resultCount", { count: resultCount });
};

export default ResultStatus;
