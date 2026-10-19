import type { ComputerSearchStatus } from "../../../electron/computerSearchTypes";
import BottomNoticeBar from "../feedback/BottomNoticeBar";

const stages = { preparing: "正在准备文件目录", scanning: "正在扫描文件目录", publishing: "正在整理文件目录", syncing: "正在更新文件目录" };
export default function CatalogPreparationNotice({ status }: { status: ComputerSearchStatus | null }) {
  if (!status || !["starting", "building", "syncing"].includes(status.state)) return null;
  const progress = status.preparation;
  const drive = progress?.drive ?? status.volumes.find(volume => ["building", "discovering", "catchingUp"].includes(volume.state))?.displayName;
  const message = `${progress ? stages[progress.stage] : "正在建立文件目录"}${drive ? ` · ${drive}` : ""}`;
  const fraction = progress?.fraction;
  const eta = progress?.remainingSeconds;
  const detail = [progress && progress.processed > 0 ? `已处理 ${progress.processed.toLocaleString()} 项` : "",
    eta != null && Number.isFinite(eta) ? eta < 60 ? "预计不到 1 分钟" : `约剩 ${Math.ceil(eta / 60)} 分钟` : ""].filter(Boolean).join(" · ");
  return <BottomNoticeBar className="cap-catalog-preparation-notice" message={message} detail={detail}
    title={`${message}。建库期间可浏览当前文件夹，搜索将在目录就绪后启用。`}
    progress={{ label: message, value: fraction ?? undefined }} />;
}
