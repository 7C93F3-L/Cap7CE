import { useState } from "react";
import type { MetadataBuildPolicy, MetadataBuildStatus } from "../../shared/metadataBuildTypes";
import "./MetadataBuildScopePanel.css";
import MetadataBuildDirectoryScopes from "./MetadataBuildDirectoryScopes";

export default function MetadataBuildScopePanel({ status, onApply, onCancel }: {
  status: MetadataBuildStatus; onApply: (policy: MetadataBuildPolicy) => void; onCancel: () => void;
}) {
  const [order, setOrder] = useState(() => [...(status.policy?.volumeOrder ?? status.volumes.map((item) => item.volumeId)),
    ...status.volumes.map((item) => item.volumeId).filter((id) => status.policy && !status.policy.volumeOrder.includes(id))]);
  const [selected, setSelected] = useState(() => new Set(status.policy?.volumeOrder ?? order));
  const [scopeBusy, setScopeBusy] = useState(false);
  const [details, setDetails] = useState<MetadataBuildPolicy>(() => status.policy ?? {
    volumeOrder: order, includes: order.map((volumeId) => ({ volumeId, rootFileReference: null })), excludes: [] });
  const move = (index: number, direction: number) => setOrder((previous) => {
    const result = [...previous]; [result[index], result[index + direction]] = [result[index + direction], result[index]]; return result;
  });
  return <section className="cap-metadata-scope" aria-label="属性提取磁盘范围与顺序">
    <strong>磁盘范围与顺序</strong><p>只处理勾选的磁盘，按列表从上往下进行。取消勾选不会删除已保存的属性。</p>
    {order.map((id, index) => <div className="cap-metadata-scope-row" key={id}>
      <label><input type="checkbox" checked={selected.has(id)} onChange={(event) => {
        const next = new Set(selected); if (event.target.checked) next.add(id); else next.delete(id); setSelected(next);
      }} />{status.volumes.find((item) => item.volumeId === id)?.label ?? "不可用磁盘"}</label>
      <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`上移磁盘 ${index + 1}`}>上移</button>
      <button type="button" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`下移磁盘 ${index + 1}`}>下移</button>
    </div>)}
    <MetadataBuildDirectoryScopes policy={details} savedLabels={status.scopeLabels} onChange={setDetails} onBusyChange={setScopeBusy}
      onActivateVolume={(id) => setSelected((previous) => new Set([...previous, id]))} />
    <div className="cap-metadata-scope-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" disabled={!selected.size || scopeBusy}
      onClick={() => { const volumeOrder = order.filter((id) => selected.has(id)); onApply({ volumeOrder,
        includes: volumeOrder.flatMap((volumeId) => details.includes.filter((scope) => scope.volumeId === volumeId)
          .length ? details.includes.filter((scope) => scope.volumeId === volumeId) : [{ volumeId, rootFileReference: null }]),
        excludes: details.excludes.filter((scope) => selected.has(scope.volumeId)) }); }}>应用</button></div>
  </section>;
}
