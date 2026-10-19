import fs from "node:fs/promises";
export const isValidPdf = async (pdfPath: string) => {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(pdfPath, "r");
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString("ascii") === "%PDF-";
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
};
