export default function CatalogPanelIcon({ side }: { side: "top" | "right" }) {
  return <svg className="cap-catalog-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    {side === "top" ? <><path d="M3 9h18" /><path className="cap-catalog-panel-area" d="M5 6h14v1H5z" /></>
      : <><path d="M15 4v16" /><path className="cap-catalog-panel-area" d="M17 6h2v12h-2z" /></>}
  </svg>;
}
