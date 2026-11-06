import { createReader } from "ag-psd/dist/psdReader";
import { readVersionAndDescriptor } from "ag-psd/dist/descriptor";
import { PsdCursor } from "./cursor";
import type { PsdArtboard } from "../../../shared/psdPreviewTypes";

const largeKeys = new Set(["LMsk", "Lr16", "Lr32", "Layr", "Mt16", "Mt32", "Mtrn", "Alph", "FMsk", "lnk2", "FEid", "FXid", "PxSD", "cinf"]);
export async function readPsdLayout(reader: PsdCursor) {
  const header = await reader.read(26), version = header.readUInt16BE(4), channels = header.readUInt16BE(12);
  const height = header.readUInt32BE(14), width = header.readUInt32BE(18), large = version === 2;
  if (header.toString("ascii", 0, 4) !== "8BPS" || ![1, 2].includes(version) || ![3, 4].includes(channels)
    || header.readUInt16BE(22) !== 8 || header.readUInt16BE(24) !== 3 || width < 1 || height < 1
    || width > 300000 || height > 300000 || width * height > 50_000_000) throw Error("psd-preview-format");
  reader.skip(await reader.u32()); reader.skip(await reader.u32());
  const layerBytes = await reader.length(large), composite = reader.position + layerBytes;
  if (composite >= reader.size) throw Error("psd-preview-layer-section");
  const whole = { name: "", left: 0, top: 0, width, height };
  if (!layerBytes) return { header, width, height, large, composite, pages: [whole] };
  const infoBytes = await reader.length(large), infoEnd = reader.position + infoBytes;
  if (infoEnd > composite || infoBytes === 1) throw Error("psd-preview-layer-section");
  if (!infoBytes) return { header, width, height, large, composite, pages: [whole] };
  const count = Math.abs((await reader.read(2)).readInt16BE());
  if (count > 10000) throw Error("psd-preview-layer-limit");
  const pages: PsdArtboard[] = [];
  for (let i = 0; i < count; i++) {
    reader.skip(16); const channelCount = await reader.u16();
    if (channelCount > 56) throw Error("psd-preview-channel-limit");
    reader.skip(channelCount * (large ? 10 : 6));
    if ((await reader.read(12)).toString("ascii", 0, 4) !== "8BIM") throw Error("psd-preview-layer-signature");
    const extra = await reader.u32(), end = reader.position + extra;
    if (end > infoEnd) throw Error("psd-preview-layer-bounds");
    reader.skip(await reader.u32()); reader.skip(await reader.u32());
    const nameLength = (await reader.read(1))[0];
    let name = (await reader.read(nameLength)).toString("utf8"); reader.skip((4 - (nameLength + 1) % 4) % 4);
    let bounds: PsdArtboard | undefined;
    while (reader.position + 12 <= end) {
      const signature = (await reader.read(4)).toString("ascii"), key = (await reader.read(4)).toString("ascii");
      if (signature !== "8BIM" && signature !== "8B64") throw Error("psd-preview-block-signature");
      const size = await reader.length(signature === "8B64" || large && largeKeys.has(key)), start = reader.position;
      if (start + size > end) throw Error("psd-preview-block-bounds");
      if (key === "luni" && size >= 4 && size <= 65540) {
        const text = await reader.read(size), length = text.readUInt32BE();
        if (length * 2 > size - 4) throw Error("psd-preview-layer-name");
        name = text.subarray(4, 4 + length * 2).swap16().toString("utf16le");
      }
      if (key === "artb") {
        if (bounds || size > 1024 * 1024) throw Error("psd-preview-artboard-limit");
        const bytes = await reader.read(size);
        const value = readVersionAndDescriptor(createReader(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.length));
        const rect = value.artboardRect as { Left: number; "Top ": number; Rght: number; Btom: number };
        if (!rect || ![rect.Left, rect["Top "], rect.Rght, rect.Btom].every(Number.isFinite)) throw Error("psd-preview-artboard-bounds");
        const left = Math.floor(rect.Left), top = Math.floor(rect["Top "]), right = Math.ceil(rect.Rght), bottom = Math.ceil(rect.Btom);
        if (left < 0 || top < 0 || right > width || bottom > height || right <= left || bottom <= top) throw Error("psd-preview-artboard-bounds");
        bounds = { name: "", left, top, width: right - left, height: bottom - top };
      }
      reader.seek(start + size + size % 2);
    }
    reader.seek(end);
    if (bounds) { pages.push({ ...bounds, name: name.slice(0, 128) }); if (pages.length > 128) throw Error("psd-preview-artboard-limit"); }
  }
  if (!pages.length) pages.push(whole);
  return { header, width, height, large, composite, pages };
}
