export const defaultSidebarWidth = 156, minimumSidebarWidth = 40, maximumSidebarWidth = 320;
const storageKey = "cap7ce.catalog.sidebar-width.v1";
export function readCatalogSidebarWidth() {
  try {
    const raw = window.localStorage.getItem(storageKey), value = raw === null ? NaN : Number(raw);
    return Number.isInteger(value) && value >= minimumSidebarWidth && value <= maximumSidebarWidth ? value : defaultSidebarWidth;
  } catch { return defaultSidebarWidth; }
}
export function saveCatalogSidebarWidth(value: number) {
  try { window.localStorage.setItem(storageKey, String(Math.round(value))); }
  catch { /* Storage failure must not block layout changes. */ }
}
