import { useState } from "react";
import type { MetadataBuildPolicy } from "../../shared/metadataBuildTypes";

type Scope = MetadataBuildPolicy["includes"][number];
export default function MetadataBuildDirectoryScopes({ policy, savedLabels, onChange, onActivateVolume, onBusyChange }: {
  policy: MetadataBuildPolicy; onChange: (policy: MetadataBuildPolicy) => void;
  onActivateVolume: (volumeId: string) => void; onBusyChange: (busy: boolean) => void;
  savedLabels: Record<string, string>;
}) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const key = (scope: Scope) => `${scope.volumeId}:${scope.rootFileReference ?? "root"}`;
  const add = async (kind: "includes" | "excludes") => {
    const api = window.cap7ce?.metadataBuild;
    if (!api || busy || !path.trim()) return;
    setBusy(true); onBusyChange(true); setError(false);
    try {
      const resolved = await api.resolveScope(path.trim());
      const scope: Scope = { volumeId: resolved.volumeId, rootFileReference: resolved.rootFileReference };
      const volumeOrder = policy.volumeOrder.includes(scope.volumeId) ? policy.volumeOrder : [...policy.volumeOrder, scope.volumeId];
      const current = kind === "includes" ? policy.includes.filter((item) => item.volumeId !== scope.volumeId || item.rootFileReference !== null) : policy.excludes;
      const values = current.some((item) => key(item) === key(scope)) ? current : [...current, scope];
      onChange({ ...policy, volumeOrder, [kind]: values });
      if (kind === "includes") onActivateVolume(scope.volumeId);
      setLabels((previous) => ({ ...previous, [key(scope)]: resolved.label })); setPath("");
    } catch { setError(true); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return <details className="cap-metadata-directory-scopes"><summary>按文件夹进一步限定</summary>
    <p>添加允许文件夹后，对应磁盘只提取这些文件夹；排除文件夹始终跳过。</p>
    <input aria-label="文件夹路径" value={path} onChange={(event) => setPath(event.target.value)} placeholder="粘贴本地文件夹路径" disabled={busy} />
    <div className="cap-metadata-scope-actions"><button type="button" disabled={busy || !path.trim()} onClick={() => void add("includes")}>只允许此文件夹</button>
      <button type="button" disabled={busy || !path.trim()} onClick={() => void add("excludes")}>排除此文件夹</button></div>
    {error && <span role="alert">无法定位这个文件夹，请确认磁盘已纳入基础索引。</span>}
    {(["includes", "excludes"] as const).map((kind) => <div key={kind}>{policy[kind].filter((scope) => kind === "excludes" || scope.rootFileReference !== null).map((scope, index) =>
      <div className="cap-metadata-scope-row" key={key(scope)}><span>{kind === "includes" ? "允许" : "排除"}：{labels[key(scope)] ?? savedLabels[key(scope)] ?? `已保存的范围 ${index + 1}`}</span>
        <button type="button" disabled={busy} onClick={() => {
          const remaining = policy[kind].filter((item) => key(item) !== key(scope));
          if (kind === "includes" && !remaining.some((item) => item.volumeId === scope.volumeId)) remaining.push({ volumeId: scope.volumeId, rootFileReference: null });
          onChange({ ...policy, [kind]: remaining });
        }}>{kind === "includes" && policy.includes.filter((item) => item.volumeId === scope.volumeId).length === 1 ? "恢复整盘" : "移除"}</button></div>)}</div>)}
  </details>;
}
