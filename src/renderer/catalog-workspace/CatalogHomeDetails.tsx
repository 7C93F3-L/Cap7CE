import { useEffect, useState } from "react";
import type { SkimPreviewInfo } from "../../shared/types";
import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";
import CatalogDetails from "./CatalogDetails";
import CatalogIconVisual from "../computer-search/CatalogIconVisual";

export default function CatalogHomeDetails({ entries, foreground }: { entries: CatalogHomeEntry[]; foreground: boolean }) {
  const entry = entries.length === 1 ? entries[0] : null, [info, setInfo] = useState<SkimPreviewInfo | null>(null);
  useEffect(() => {
    let live = true; setInfo(value => value?.path === entry?.path ? value : null);
    if (entry && foreground) void window.cap7ce?.skim?.inspect?.({ path: entry.path, kind: "folder" })
      .then(value => { if (live) setInfo(value); }).catch(() => {});
    return () => { live = false; };
  }, [entry?.path, foreground]);
  if (!entries.length) return <CatalogDetails selection={null} path={null} count={0} foreground={foreground} />;
  const title = entry ? entry.kind === "drive" ? "磁盘" : "文件夹" : "多选信息";
  return <aside className="cap-catalog-details" aria-label="详细信息" data-selection-preserve="true">
    <header><strong>{title}</strong></header>
    {entry && <div className="cap-catalog-details-visual"><CatalogIconVisual icon={entry.icon} name={entry.name} /></div>}
    <section className="cap-catalog-details-card">
      <strong className="cap-catalog-details-name">{entry?.name ?? `已选择 ${entries.length} 项`}</strong>
      <dl>{entry ? <><dt className="cap-catalog-details-location">位置</dt><dd>{entry.path}</dd>
        <dt>修改时间</dt><dd>{info?.path === entry.path ? new Date(info.modifiedAt).toLocaleString() : "—"}</dd></>
        : <><dt>文件夹</dt><dd>{entries.filter(item => item.kind === "folder").length} 项</dd>
          <dt>磁盘</dt><dd>{entries.filter(item => item.kind === "drive").length} 项</dd></>}</dl>
    </section>
  </aside>;
}
