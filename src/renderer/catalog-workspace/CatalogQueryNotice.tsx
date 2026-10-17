import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";
import BottomNoticeBar from "../feedback/BottomNoticeBar";

export default function CatalogQueryNotice({ busy, invalid }: { busy: boolean; invalid: boolean }) {
  const status = invalid ? "invalid" : busy ? "loading" : "", [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    if (!status) return;
    const show = window.setTimeout(() => setShown(status), status === "loading" ? 300 : 0);
    const expire = status === "invalid" ? window.setTimeout(() => setShown(""), 10000) : null;
    return () => { window.clearTimeout(show); if (expire !== null) window.clearTimeout(expire); };
  }, [status]);
  if (!status || shown !== status) return null;
  const message = t(status === "invalid" ? "computerSearch.invalidFilters" : "computerSearch.loading");
  return <BottomNoticeBar className="cap-catalog-query-notice" message={message}
    progress={status === "loading" ? { label: message } : undefined}
    actions={<button type="button" aria-label="关闭查询提醒" onClick={() => setShown("")}>×</button>} />;
}
