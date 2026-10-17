import { useRef } from "react";
import type { CatalogSelection } from "../../shared/catalogPresentationTypes";
import ComputerSearchResultVisual from "../computer-search/ComputerSearchResultVisual";
import CatalogFileInformation from "./CatalogFileInformation";
import CatalogBatchKeywords from "./CatalogBatchKeywords";

const bytes = (size: number) => size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(2)} GB`
  : size >= 1024 ** 2 ? `${(size / 1024 ** 2).toFixed(2)} MB` : `${(size / 1024).toFixed(1)} KB`;
// Catalog timestamps retain NTFS FILETIME's 1601 epoch.
const date = (ticks: number | null) => ticks ? new Date(ticks / 10000 - 11644473600000).toLocaleString() : "—";
export default function CatalogDetails({ selection, path, count, foreground, searching = false, filterCount = 0 }: {
  selection: CatalogSelection | null; path: string | null; count: number; foreground: boolean; searching?: boolean; filterCount?: number;
}) {
  const ref = useRef<HTMLElement | null>(null), items = selection?.items ?? [], item = items.length === 1 ? items[0] : null;
  if (item && !item.isDirectory && selection) return <CatalogFileInformation selection={selection} foreground={foreground} />;
  return <aside className="cap-catalog-details" ref={ref} aria-label="详细信息" data-selection-preserve="true">
    <header title={item?.name ?? path ?? "此电脑"}><strong>{item ? "文件夹" : items.length ? "多选信息" : searching ? "当前搜索" : path?.replace(/\\+$/, "").split("\\").pop() || "此电脑"}</strong></header>
    {item && selection && <div className="cap-catalog-details-visual"><ComputerSearchResultVisual item={item} taskId={selection.taskId} foreground={foreground} scrollContainerRef={ref} /></div>}
    <strong className="cap-catalog-details-name">{item?.name ?? (items.length ? `已选择 ${items.length} 项` : path?.replace(/\\+$/, "").split("\\").pop() || "此电脑")}</strong>
    <dl>{item ? <><dt>大小</dt><dd>{item.isDirectory ? "未计算" : item.sizeBytes === null ? "—" : bytes(item.sizeBytes)}</dd>
      <dt>修改时间</dt><dd>{date(item.modifiedUtcTicks)}</dd><dt>位置</dt><dd>{item.path}</dd></>
      : items.length ? <><dt>文件</dt><dd>{items.filter(value => !value.isDirectory).length} 项</dd><dt>文件夹</dt><dd>{items.filter(value => value.isDirectory).length} 项</dd>
        <dt>已知文件大小</dt><dd>{bytes(items.reduce((sum, value) => sum + (value.isDirectory ? 0 : value.sizeBytes ?? 0), 0))}</dd></>
      : searching ? <><dt>搜索范围</dt><dd>{path ?? "此电脑"}</dd><dt>筛选条件</dt><dd>{filterCount} 项</dd><dt>已加载结果</dt><dd>{count} 项</dd></>
      : <><dt>位置</dt><dd>{path ?? "此电脑"}</dd><dt>{path ? "当前结果" : "浏览范围"}</dt><dd>{path ? `${count} 项` : "系统位置与本机磁盘"}</dd></>}</dl>
    {items.length > 1 && items.some(value => !value.isDirectory) && selection && <CatalogBatchKeywords items={items} taskId={selection.taskId} foreground={foreground} />}
  </aside>;
}
