import type { ArchivePreviewData, ArchivePreviewEntry } from "../src/shared/archivePreviewTypes";
const parseByteCount = (value: string | undefined) => {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseFields = (block: string) => {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(" = ");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator), line.slice(separator + 3));
  }
  return fields;
};

export const parseArchiveListOutput = (
  output: string,
  outputTruncated = false,
  maximumEntries = 2_000
): ArchivePreviewData => {
  const parsedEntries: ArchivePreviewEntry[] = [];
  let totalUncompressedSize = 0;
  let discoveredEntries = 0;
  let skippedEntries = false;

  for (const block of output.split(/\r?\n\r?\n/)) {
    const fields = parseFields(block);
    const entryPath = fields.get("Path");
    const size = parseByteCount(fields.get("Size"));
    if (entryPath === undefined || size === null) {
      if (!fields.has("Type") && (fields.has("Size") || fields.has("Folder") || fields.has("Attributes"))) skippedEntries = true;
      continue;
    }
    if (!entryPath || entryPath.length > 4096 || /[\u0000-\u001f]/.test(entryPath)) { skippedEntries = true; continue; }

    discoveredEntries += 1;
    totalUncompressedSize += size;
    if (parsedEntries.length >= maximumEntries) continue;
    parsedEntries.push({
      path: entryPath,
      size,
      compressedSize: parseByteCount(fields.get("Packed Size")),
      directory: fields.get("Folder") === "+" || fields.get("Attributes")?.includes("D") === true
    });
  }

  return {
    entries: parsedEntries,
    entryCount: discoveredEntries,
    totalUncompressedSize,
    truncated: outputTruncated || skippedEntries || discoveredEntries > parsedEntries.length
  };
};
