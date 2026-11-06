import fs from "node:fs/promises";
import path from "node:path";
import { PsdCursor } from "./cursor";
import { readPsdLayout } from "./layout";

type SourceStat = import("node:fs").BigIntStats;
const stamp = (stat: SourceStat) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
export async function assertPsdSource(file: string, expected: string) {
  const stat = await fs.lstat(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stamp(stat) !== expected) throw Error("psd-preview-source-changed");
}
export async function readPsdSource(file: string) {
  if (!/^[a-z]:[\\/]/i.test(file) || file.includes("\0") || ![".psd", ".psb"].includes(path.extname(file).toLowerCase())) throw Error("psd-preview-source");
  const initial = await fs.lstat(file, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size > 8n * 1024n ** 3n) throw Error("psd-preview-source-limit");
  const handle = await fs.open(file, "r");
  try {
    if (stamp(await handle.stat({ bigint: true })) !== stamp(initial)) throw Error("psd-preview-source-changed");
    const layout = await readPsdLayout(new PsdCursor(handle, Number(initial.size)));
    const length = Number(initial.size) - layout.composite;
    if (length < 2 || length > 128 * 1024 * 1024) throw Error("psd-preview-composite-limit");
    // A minimal in-memory container feeds the existing composite decoder, without layer pixels.
    const offset = 26 + 4 + 4 + (layout.large ? 8 : 4), input = Buffer.alloc(offset + length);
    layout.header.copy(input); let read = 0;
    while (read < length) {
      const result = await handle.read(input, offset + read, length - read, layout.composite + read);
      if (!result.bytesRead) throw Error("psd-preview-truncated"); read += result.bytesRead;
    }
    if (![0, 1].includes(input.readUInt16BE(offset))) throw Error("psd-preview-compression");
    await assertPsdSource(file, stamp(initial));
    return { input, pages: layout.pages, width: layout.width, height: layout.height, stamp: stamp(initial) };
  } finally { await handle.close(); }
}
