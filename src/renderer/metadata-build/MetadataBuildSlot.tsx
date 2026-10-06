import { useEffect, useState } from "react";
import type { MetadataBuildPolicy, MetadataBuildProgress } from "../../shared/metadataBuildTypes";
import MetadataBuildPanel from "./MetadataBuildPanel";
import MetadataBuildScopePanel from "./MetadataBuildScopePanel";
import { useMetadataBuild } from "./useMetadataBuild";
import "./MetadataBuildSlot.css";

export default function MetadataBuildSlot({ enabled, foreground, onProgress }: {
  enabled: boolean; foreground: boolean; onProgress?: (progress: MetadataBuildProgress) => void;
}) {
  const build = useMetadataBuild(enabled, foreground);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MetadataBuildPolicy | null>(null);
  useEffect(() => {
    if (enabled && foreground && build.status) onProgress?.(build.status.progress);
  }, [enabled, foreground, build.status, onProgress]);
  if (!enabled || !build.status || build.status.volumes.length === 0) return null;
  const status = build.status;
  const policy = draft ?? status.policy;
  const scope = (policy?.volumeOrder ?? status.volumes.map((item) => item.volumeId)).filter((id) =>
    !policy?.excludes.some((item) => item.volumeId === id && item.rootFileReference === null));
  const folderCount = policy?.includes.filter((item) => item.rootFileReference !== null).length ?? 0;
  const excluded = policy?.excludes.length ?? 0;
  const summary = `${scope.map((id) => status.volumes.find((item) => item.volumeId === id)?.label ?? "不可用磁盘").join(" → ") || "没有可提取范围"}${folderCount ? ` · ${folderCount} 个允许文件夹` : ""}${excluded ? ` · ${excluded} 个排除范围` : ""}`;
  const label = status.volumes.find((item) => item.volumeId === status.progress.volumeId)?.label;
  return <div className="cap-metadata-build-slot">
    {collapsed ? <button type="button" className="cap-metadata-build-reopen" onClick={() => setCollapsed(false)}>文件属性建库</button>
      : editing ? <MetadataBuildScopePanel status={{ ...status, policy }} onCancel={() => setEditing(false)}
        onApply={(next) => { setDraft(next); setEditing(false); void build.refresh(); }} />
      : <MetadataBuildPanel progress={status.progress} scopeSummary={summary}
        currentDriveLabel={label} actionBusy={build.busy}
        onStart={() => void build.action("start", policy)} onPause={() => void build.action("pause")} onResume={() => void build.action(draft ? "start" : "resume", policy)}
        onChangeScope={() => setEditing(true)} onDismiss={() => setCollapsed(true)} />}
    {build.error && <span role="alert">操作未完成，请重试</span>}
  </div>;
}
