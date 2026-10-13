const paths = {
  back: "M19 12H5m7-7-7 7 7 7", forward: "M5 12h14m-7-7 7 7-7 7",
  up: "M12 19V5m-7 7 7-7 7 7", refresh: "M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3",
  computer: "M4 4h16v12H4zM12 16v4m-4 0h8",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
};
export default function CatalogToolbarIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="cap-catalog-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
