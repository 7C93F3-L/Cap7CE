import fs from "node:fs/promises";
import path from "node:path";
import createSevenZip from "7z-wasm";
import { parseArchiveListOutput } from "./archivePreviewList";
import { deriveArchiveFact } from "./archiveFactExtractor";
import { supportedArchiveFactExtensions } from "./archiveFactTypes";
import type { SearchArchiveContentType } from "../../resourceCatalog/domain/formats/archiveSearchFilters";
import { boundWasmMemory } from "./boundedWasmMemory";
import { restrictArchiveSourceFilesystem } from "./archiveSourceFilesystem";

export interface ArchiveMetadataProperties {
  listingComplete: boolean;
  fileCount?: number;
  hasDirectories?: boolean;
  contentTypes: SearchArchiveContentType[];
}
let boundedBinary: Promise<Uint8Array> | undefined;
const loadBinary = () => boundedBinary ??= fs.readFile(require.resolve("7z-wasm/7zz.wasm"))
  .then(bytes => boundWasmMemory(bytes, 256 * 1024 * 1024));

// Runs in the owned OS metadata helper, never the application process. Listing
// is synchronous inside WASM; the owner enforces its timeout/cancellation lifetime.
export const readArchiveMetadata = async (filePath: string, signal: AbortSignal, maximumOutputBytes = 4 * 1024 * 1024): Promise<ArchiveMetadataProperties | undefined> => {
  signal.throwIfAborted();
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 * 1024
    || !supportedArchiveFactExtensions.some(extension => extension === path.extname(filePath).toLowerCase())) throw new Error("archive-fact-source-unavailable");
  if (!Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1 || maximumOutputBytes > 4 * 1024 * 1024) throw new Error("archive-fact-output-limit-invalid");
  const lines: string[] = []; let bytes = 0, truncated = false, exitCode = 0;
  const print = (value: string) => {
    const length = Buffer.byteLength(value, "utf8") + 1;
    if (bytes + length > maximumOutputBytes) { truncated = true; throw Object.assign(new Error("archive-output-limit"), { code: "EOUTPUTLIMIT" }); }
    lines.push(value); bytes += length;
  };
  const binary = await loadBinary(); signal.throwIfAborted();
  const module = await createSevenZip({ wasmBinary: new Uint8Array(binary).buffer, stdin: () => -1, print, printErr: print,
    quit: (code, status) => { exitCode = code; throw status; } });
  signal.throwIfAborted();
  restrictArchiveSourceFilesystem(module, filePath);
  // This creates a virtual mount point, never a source-directory entry.
  const virtualFilesystem = module.FS;
  virtualFilesystem.mkdir("/source"); virtualFilesystem.mount(module.NODEFS, { root: path.dirname(filePath) }, "/source"); virtualFilesystem.chdir("/source");
  try { module.callMain(["l", "-slt", "-sccUTF-8", "-p__CAP7CE_LIST_ONLY_NO_PASSWORD__", "--", path.basename(filePath)]); }
  catch (error) {
    const result = error as { status?: unknown; code?: unknown };
    if (result.code !== "EOUTPUTLIMIT" && typeof result.status === "number") exitCode = result.status;
    else if (result.code !== "EOUTPUTLIMIT" && exitCode === 0) throw new Error("archive-fact-list-failed");
  } finally { virtualFilesystem.chdir("/"); virtualFilesystem.unmount("/source"); }
  signal.throwIfAborted();
  const output = lines.join("\n");
  if (exitCode !== 0 || /^Encrypted = \+$/m.test(output)) throw new Error("archive-fact-list-unavailable");
  const preview = parseArchiveListOutput(output, truncated, Number.MAX_SAFE_INTEGER);
  // Technical listing emits no Files summary for a valid empty ZIP. Require
  // the recognized archive header and entry separator before accepting zero.
  if (!preview.entryCount && !truncated && !(/^Type = (zip|7z|rar|rar5)$/mi.test(output) && /^----------\s*$/m.test(output))) throw new Error("archive-fact-invalid-list");
  const fact = deriveArchiveFact(preview);
  if (!fact.fileCountKnown && !fact.structureKnown && !fact.contentTypes.length) return undefined;
  return { listingComplete: fact.listingComplete, ...(fact.fileCountKnown ? { fileCount: fact.fileCount } : {}),
    ...(fact.structureKnown ? { hasDirectories: fact.hasDirectories } : {}), contentTypes: fact.contentTypes };
};
