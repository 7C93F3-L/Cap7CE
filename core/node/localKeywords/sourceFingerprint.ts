import fs from "node:fs/promises";
import type { KeywordSourceIdentity } from "../../../core/shared/localKeywordTypes";

export async function fingerprintKeywordSource(item: KeywordSourceIdentity) {
  const stat = await fs.lstat(item.path, { bigint: true });
  const created = item.createdFileTimeMilliseconds ?? (item.createdUtcTicks == null ? null : String(Math.trunc(item.createdUtcTicks / 10000)));
  if (!stat.isFile() || (/^[\da-f]{16}$/iu.test(item.fileReference) && BigInt(`0x${item.fileReference}`) !== stat.ino)
    || (created !== null && BigInt(created) - 11644473600000n !== stat.birthtimeNs / 1000000n)) {
    throw Error("文件已发生变化，请重新选择文件后重试。");
  }
  return [stat.dev, stat.ino, stat.size, stat.birthtimeNs, stat.mtimeNs].join(":");
}
