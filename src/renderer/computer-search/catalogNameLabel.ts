// Measure with the rendered font; keep the extension only for file entries.
export function catalogNameLabel(name: string, width: number, isFile: boolean, measure: (text: string) => number): string {
  if (measure(name) <= width) return name;
  const chars = Array.from(name), ellipsis = "…";
  if (measure(ellipsis) > width) return "";
  const dot = name.lastIndexOf(".");
  const extension = isFile && dot > 0 ? Array.from(name.slice(dot)).length : 0;
  const suffix = (count: number) => count ? chars.slice(-count).join("") : "";
  const largest = (maximum: number, fits: (count: number) => boolean) => {
    let low = 0, high = maximum;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(middle)) low = middle; else high = middle - 1;
    }
    return low;
  };
  const first = chars[0] ?? "";
  const room = Math.max(0, width - measure(first + ellipsis));
  const suffixBudget = Math.min(room, Math.max(width * .35, measure(suffix(extension))));
  let tail = largest(Math.max(0, chars.length - 1), count => measure(suffix(count)) <= suffixBudget);
  // If the prefix cannot coexist with the extension, show as much of the ending as fits.
  if (tail < Math.max(1, extension)) tail = largest(Math.max(0, chars.length - 1), count => measure(ellipsis + suffix(count)) <= width);
  const head = largest(Math.max(0, chars.length - tail - 1), count => measure(chars.slice(0, count).join("") + ellipsis + suffix(tail)) <= width);
  return chars.slice(0, head).join("") + ellipsis + suffix(tail);
}
