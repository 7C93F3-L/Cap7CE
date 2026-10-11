import { useState } from "react";

export default function CatalogAttributeNotice({ message, onMetadata }: { message: string; onMetadata: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <div className="cap-catalog-attribute-notice" role="status">
    <span>{message}</span><button type="button" onClick={onMetadata}>文件属性提取</button>
    <button type="button" aria-label="关闭属性提示" title="关闭属性提示" onClick={() => setDismissed(true)}>×</button>
  </div>;
}
