import type { SkimBrowseEntry } from "../../../electron/skimBrowseService";
import type { DirectoryBrowseOptions } from "../../../src/shared/directoryBrowseTypes";
export function filterDirectoryEntries(entries: SkimBrowseEntry[], options: DirectoryBrowseOptions) {
  const f = options.fileConditions;
  if (f && (typeof f !== "object" || Array.isArray(f) || Object.keys(f).some(key => !["extensions", "excludedExtensions", "minimumSizeBytes", "maximumSizeBytes", "minimumModifiedFileTime", "maximumModifiedFileTime"].includes(key)))) throw Error("directory-browse-invalid-request");
  for (const values of [f?.extensions, f?.excludedExtensions]) if (values !== undefined && (!Array.isArray(values) || values.length > 512 || values.some(value => typeof value !== "string" || value.length > 128))) throw Error("directory-browse-invalid-request");
  for (const size of [f?.minimumSizeBytes, f?.maximumSizeBytes]) if (size !== undefined && (!Number.isSafeInteger(size) || size < 0)) throw Error("directory-browse-invalid-request");
  for (const time of [f?.minimumModifiedFileTime, f?.maximumModifiedFileTime]) if (time !== undefined && (typeof time !== "string" || !/^\d{1,20}$/.test(time))) throw Error("directory-browse-invalid-request");
  return entries.filter(item => {
    if (options.excludeHidden && item.hidden || item.status !== "ready") return false;
    if (!f) return true;
    if (item.kind !== "file") return false;
    if (f.extensions !== undefined && !f.extensions.some(ext => ext.toLowerCase() === item.extension.toLowerCase())) return false;
    if (f.excludedExtensions?.some(ext => ext.toLowerCase() === item.extension.toLowerCase())) return false;
    if (f.minimumSizeBytes !== undefined && (item.size ?? 0) < f.minimumSizeBytes || f.maximumSizeBytes !== undefined && (item.size ?? 0) > f.maximumSizeBytes) return false;
    const ticks = item.modifiedAt ? (BigInt(Date.parse(item.modifiedAt)) + 11644473600000n) * 10000n : null;
    return !(f.minimumModifiedFileTime !== undefined && (ticks === null || ticks < BigInt(f.minimumModifiedFileTime))
      || f.maximumModifiedFileTime !== undefined && (ticks === null || ticks > BigInt(f.maximumModifiedFileTime)));
  });
}
export function sortDirectoryEntries(entries: SkimBrowseEntry[], sort: DirectoryBrowseOptions["sort"]) {
  const direction = sort.endsWith("descending") ? -1 : 1;
  return entries.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder")
    || direction * (sort.startsWith("modified") ? Date.parse(a.modifiedAt ?? "") - Date.parse(b.modifiedAt ?? "") : a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }))
    || a.path.localeCompare(b.path));
}
