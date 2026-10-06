import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { supportedTextDataFactExtensions, type JsonRootKind, type TextDataFactKind } from "./textDataFactTypes";

const maximumTextDataBytes = 256 * 1024 * 1024;
const maximumJsonBytes = 64 * 1024 * 1024;
const supportedExtensionSet = new Set<string>(supportedTextDataFactExtensions);
type TextEncoding = "utf-8" | "utf-16le" | "utf-16be";

const getKind = (extension: string): TextDataFactKind => extension === ".csv" ? "csv" : extension === ".json" ? "json" : "text";

const inspectEncoding = async (filePath: string, fileSize: number) => {
  const handle = await fs.open(filePath, "r");
  try {
    const sample = Buffer.alloc(Math.min(fileSize, 64 * 1024));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const source = sample.subarray(0, bytesRead);
    if (source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return { encoding: "utf-8" as const, bomBytes: 3 };
    if (source[0] === 0xff && source[1] === 0xfe) return { encoding: "utf-16le" as const, bomBytes: 2 };
    if (source[0] === 0xfe && source[1] === 0xff) return { encoding: "utf-16be" as const, bomBytes: 2 };
    if (source.includes(0)) throw new Error("text-data-encoding-unsupported");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let valid = false;
    const maximumTrim = source.length < fileSize ? Math.min(3, source.length) : 0;
    for (let trim = 0; trim <= maximumTrim && !valid; trim += 1) {
      try {
        decoder.decode(source.subarray(0, source.length - trim));
        valid = true;
      } catch {
        // The fixed-size sample may end in the middle of one UTF-8 sequence.
      }
    }
    if (!valid) throw new Error("text-data-encoding-unsupported");
    return { encoding: "utf-8" as const, bomBytes: 0 };
  } catch (error) {
    if (error instanceof Error && error.message === "text-data-encoding-unsupported") throw error;
    throw new Error("text-data-encoding-unsupported");
  } finally {
    await handle.close();
  }
};

const readDecodedChunks = async (filePath: string, encoding: TextEncoding, bomBytes: number, onText: (text: string) => void) => {
  const decoder = new TextDecoder(encoding, { fatal: true });
  try {
    for await (const chunk of createReadStream(filePath, { start: bomBytes, highWaterMark: 64 * 1024 })) {
      const text = decoder.decode(chunk as Buffer, { stream: true });
      if (text) onText(text);
    }
    const finalText = decoder.decode();
    if (finalText) onText(finalText);
  } catch (error) {
    if (error instanceof Error && /^text-data-[a-z-]+$/.test(error.message)) throw error;
    throw new Error("text-data-encoding-unsupported");
  }
};

const readTextCounts = async (filePath: string, encoding: TextEncoding, bomBytes: number) => {
  let characterCount = 0;
  let lineBreakCount = 0;
  let hasCharacters = false;
  let previousWasCarriageReturn = false;
  await readDecodedChunks(filePath, encoding, bomBytes, (text) => {
    for (const character of text) {
      hasCharacters = true;
      characterCount += 1;
      if (character === "\r") {
        lineBreakCount += 1;
        previousWasCarriageReturn = true;
      } else if (character === "\n") {
        if (!previousWasCarriageReturn) lineBreakCount += 1;
        previousWasCarriageReturn = false;
      } else {
        previousWasCarriageReturn = false;
      }
    }
  });
  return { characterCount, lineCount: hasCharacters ? lineBreakCount + 1 : 0 };
};

const readCsvCounts = async (filePath: string, encoding: TextEncoding, bomBytes: number) => {
  let recordCount = 0;
  let columnCount = 0;
  let currentColumns = 1;
  let recordStarted = false;
  let fieldStarted = false;
  let inQuotes = false;
  let quotePending = false;
  let skipLineFeed = false;
  const finishRecord = () => {
    if (recordStarted) {
      recordCount += 1;
      columnCount = Math.max(columnCount, currentColumns);
    }
    currentColumns = 1;
    recordStarted = false;
    fieldStarted = false;
  };
  const consume = (character: string) => {
    if (inQuotes) {
      if (!quotePending) {
        if (character === "\"") quotePending = true;
        else recordStarted = true;
        return;
      }
      if (character === "\"") {
        quotePending = false;
        recordStarted = true;
        return;
      }
      inQuotes = false;
      quotePending = false;
      if (character !== "," && character !== "\r" && character !== "\n") throw new Error("text-data-csv-invalid");
    }
    if (skipLineFeed) {
      skipLineFeed = false;
      if (character === "\n") return;
    }
    if (character === "\"") {
      if (fieldStarted) throw new Error("text-data-csv-invalid");
      inQuotes = true;
      fieldStarted = true;
      recordStarted = true;
    } else if (character === ",") {
      currentColumns += 1;
      fieldStarted = false;
      recordStarted = true;
    } else if (character === "\r") {
      finishRecord();
      skipLineFeed = true;
    } else if (character === "\n") {
      finishRecord();
    } else {
      fieldStarted = true;
      recordStarted = true;
    }
  };
  await readDecodedChunks(filePath, encoding, bomBytes, (text) => {
    for (const character of text) consume(character);
  });
  if (inQuotes && !quotePending) throw new Error("text-data-csv-invalid");
  finishRecord();
  return { recordCount, columnCount };
};

const readJsonCounts = async (filePath: string, encoding: TextEncoding, bomBytes: number) => {
  let source = "";
  await readDecodedChunks(filePath, encoding, bomBytes, (text) => { source += text; });
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("text-data-json-invalid");
  }
  if (Array.isArray(value)) return { recordCount: value.length, jsonRootKind: "array" as const };
  if (value && typeof value === "object") return { recordCount: Object.keys(value).length, jsonRootKind: "object" as const };
  throw new Error("text-data-json-root-unsupported");
};

export const readTextDataFact = async (filePath: string): Promise<{
  factKind: TextDataFactKind;
  characterCount: number;
  lineCount: number;
  recordCount: number;
  columnCount: number;
  jsonRootKind: JsonRootKind;
}> => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > maximumTextDataBytes) throw new Error("text-data-source-unavailable");
  const extension = path.extname(filePath).toLowerCase();
  if (!supportedExtensionSet.has(extension)) throw new Error("text-data-format-unsupported");
  const factKind = getKind(extension);
  if (factKind === "json" && stat.size > maximumJsonBytes) throw new Error("text-data-source-unavailable");
  const { encoding, bomBytes } = await inspectEncoding(filePath, stat.size);
  if (factKind === "text") {
    const counts = await readTextCounts(filePath, encoding, bomBytes);
    return { factKind, ...counts, recordCount: 0, columnCount: 0, jsonRootKind: "none" };
  }
  if (factKind === "csv") {
    const counts = await readCsvCounts(filePath, encoding, bomBytes);
    return { factKind, characterCount: 0, lineCount: 0, ...counts, jsonRootKind: "none" };
  }
  const counts = await readJsonCounts(filePath, encoding, bomBytes);
  return { factKind, characterCount: 0, lineCount: 0, columnCount: 0, ...counts };
};
