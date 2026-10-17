export default function CatalogAttributeNotice({ message, onMetadata }: { message: string; onMetadata: () => void }) {
  return <button type="button" className="cap-catalog-attribute-notice" title={`${message} 点击打开文件属性提取。`}
    aria-label={`${message} 打开文件属性提取`} onClick={onMetadata}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 9v5M10 6v.5" /></svg>
  </button>;
}
