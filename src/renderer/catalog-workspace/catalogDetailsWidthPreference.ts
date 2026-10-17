export const defaultDetailsWidth = 280, minimumDetailsWidth = 220, maximumDetailsWidth = 420;
const storageKey = "cap7ce.catalog.details-width.v1";

export function readCatalogDetailsWidth() {
  try {
    const raw = window.localStorage.getItem(storageKey), value = raw === null ? NaN : Number(raw);
    return Number.isInteger(value) && value >= minimumDetailsWidth && value <= maximumDetailsWidth ? value : defaultDetailsWidth;
  } catch { return defaultDetailsWidth; }
}
export function saveCatalogDetailsWidth(value: number) {
  try { window.localStorage.setItem(storageKey, String(Math.round(value))); }
  catch { /* Unavailable local storage must not block resizing. */ }
}
