const opentype = require("opentype.js");
const createPdf = (pageCount) => {
  const objects = [];
  const pageObjectNumbers = [];
  const fontObjectNumber = 3 + pageCount * 2;
  for (let index = 0; index < pageCount; index += 1) {
    pageObjectNumbers.push(3 + index * 2);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = pageObjectNumber + 1;
    const content = `BT /F1 24 Tf 72 720 Td (Page ${index + 1}) Tj ET`;
    objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  }
  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(source);
    source += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
};
const makeMobi = ({ encryption = 0, version = 6, textLengthOverride, invalidSecondOffset = false } = {}) => {
  const title = Buffer.from("测试 MOBI", "utf8");
  const text = Buffer.from("<html><head></head><body><h1>第一章</h1><p>安全正文内容</p></body></html>", "utf8");
  const record0 = Buffer.alloc(260 + title.length);
  record0.writeUInt16BE(1, 0);
  record0.writeUInt32BE(textLengthOverride ?? text.length, 4);
  record0.writeUInt16BE(1, 8);
  record0.writeUInt16BE(4096, 10);
  record0.writeUInt16BE(encryption, 12);
  record0.write("MOBI", 16, "ascii");
  record0.writeUInt32BE(232, 20);
  record0.writeUInt32BE(2, 24);
  record0.writeUInt32BE(65001, 28);
  record0.writeUInt32BE(123456, 32);
  record0.writeUInt32BE(version, 36);
  record0.writeUInt32BE(260, 84);
  record0.writeUInt32BE(title.length, 88);
  record0.writeUInt32BE(2, 108);
  record0.writeUInt32BE(0, 112);
  record0.writeUInt32BE(0, 116);
  record0.writeUInt32BE(64, 128);
  record0.writeUInt32BE(0, 240);
  record0.writeUInt32BE(0xffffffff, 244);
  record0.write("EXTH", 248, "ascii");
  record0.writeUInt32BE(12, 252);
  record0.writeUInt32BE(0, 256);
  title.copy(record0, 260);

  const header = Buffer.alloc(94);
  header.write("Test_Mobi", 0, "ascii");
  header.write("BOOK", 60, "ascii");
  header.write("MOBI", 64, "ascii");
  header.writeUInt16BE(2, 76);
  header.writeUInt32BE(94, 78);
  header.writeUInt32BE(invalidSecondOffset ? 0xffffffff : 94 + record0.length, 86);
  return Buffer.concat([header, record0, text]);
};
const createOpenTypeFixture = () => {
  const notdef = new opentype.Glyph({ name: ".notdef", advanceWidth: 500, path: new opentype.Path() });
  const latinPath = new opentype.Path();
  latinPath.moveTo(40, 0);
  latinPath.lineTo(300, 700);
  latinPath.lineTo(560, 0);
  latinPath.close();
  const latin = new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 600, path: latinPath });
  const font = new opentype.Font({
    familyName: "Cap7CE OTF Probe",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [notdef, latin]
  });
  return Buffer.from(font.toArrayBuffer());
};
module.exports = { createPdf, makeMobi, createOpenTypeFixture };
