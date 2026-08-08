import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";
import { parse } from "parse5";
import sharp from "sharp";
import type {
  EpubPreviewChapter,
  EpubPreviewFallbackReason,
  EpubWorkerResponse
} from "./epubPreviewTypes";

const MAX_ENTRY_COUNT = 2_000;
const MAX_ENTRY_SIZE = 8 * 1024 * 1024;
const MAX_EXPANDED_SIZE = 64 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4 * 1024 * 1024;

class EpubWorkerError extends Error {
  constructor(readonly reason: EpubPreviewFallbackReason, message: string) {
    super(message);
  }
}

interface ManifestItem {
  href: string;
  type: string;
  properties: string;
}

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
}

type XmlDocument = ReturnType<DOMParser["parseFromString"]>;

const normalizeEntryPath = (value: string) => {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");
  if (
    !normalized
    || normalized.startsWith("../")
    || normalized.startsWith("/")
    || /^[a-z]:/i.test(normalized)
    || normalized.includes("\0")
  ) {
    throw new EpubWorkerError("invalidEpub", "EPUB contains an unsafe entry path.");
  }
  return normalized;
};

const parseXml = (bytes: Uint8Array) => (
  new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml")
);

const getElementsByLocalName = (node: XmlDocument, name: string) => (
  Array.from(node.getElementsByTagName("*")).filter((element) => (
    element.localName === name || element.nodeName.split(":").slice(-1)[0] === name
  ))
);

const extractHtmlText = (node: HtmlNode): string => {
  if (node.nodeName === "#text") return node.value ?? "";
  const name = String(node.tagName ?? node.nodeName ?? "").toLowerCase();
  if (["script", "style", "noscript", "svg"].includes(name)) return "";
  const content = (node.childNodes ?? []).map(extractHtmlText).join(" ");
  return ["p", "div", "li", "h1", "h2", "h3", "h4", "br"].includes(name)
    ? `${content}\n`
    : content;
};

const renderCover = async (bytes?: Uint8Array) => {
  if (!bytes) return null;
  try {
    const png = await sharp(Buffer.from(bytes))
      .resize({ width: 360, height: 480, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
};

const run = async () => {
  const source = new Uint8Array(fs.readFileSync(workerData.sourcePath));
  let entryCount = 0;
  let expandedSize = 0;
  const seenEntryPaths = new Set<string>();
  const entries = unzipSync(source, {
    filter(entry) {
      entryCount += 1;
      const entryPath = normalizeEntryPath(entry.name);
      const entryPathKey = entryPath.toLowerCase();
      const entrySize = Number(entry.originalSize || 0);
      if (seenEntryPaths.has(entryPathKey)) {
        throw new EpubWorkerError("invalidEpub", "EPUB contains duplicate entry paths.");
      }
      seenEntryPaths.add(entryPathKey);
      expandedSize += entrySize;
      if (
        entryCount > MAX_ENTRY_COUNT
        || entrySize > MAX_ENTRY_SIZE
        || expandedSize > MAX_EXPANDED_SIZE
      ) {
        throw new EpubWorkerError("tooLarge", "EPUB expanded content exceeds the preview limit.");
      }
      return !entryPath.endsWith("/");
    }
  });
  const getEntry = (entryPath: string) => entries[normalizeEntryPath(entryPath)];

  const mimetype = getEntry("mimetype");
  if (!mimetype || new TextDecoder().decode(mimetype) !== "application/epub+zip") {
    throw new EpubWorkerError("invalidEpub", "EPUB mimetype is invalid.");
  }
  if (getEntry("META-INF/encryption.xml")) {
    throw new EpubWorkerError("encrypted", "Encrypted EPUB content cannot be previewed.");
  }

  const containerBytes = getEntry("META-INF/container.xml");
  if (!containerBytes) throw new EpubWorkerError("invalidEpub", "EPUB container is missing.");
  const container = parseXml(containerBytes);
  const opfPath = normalizeEntryPath(
    getElementsByLocalName(container, "rootfile")[0]?.getAttribute("full-path") ?? ""
  );
  const opfBytes = getEntry(opfPath);
  if (!opfBytes) throw new EpubWorkerError("invalidEpub", "EPUB package document is missing.");
  const opf = parseXml(opfBytes);
  const packageDirectory = path.posix.dirname(opfPath);
  const manifest = new Map<string, ManifestItem>(getElementsByLocalName(opf, "item").map((item) => [
    item.getAttribute("id") ?? "",
    {
      href: normalizeEntryPath(path.posix.join(packageDirectory, item.getAttribute("href") ?? "")),
      type: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? ""
    }
  ]));

  const title = getElementsByLocalName(opf, "title")[0]?.textContent?.trim()
    || path.basename(workerData.sourcePath);
  const creator = getElementsByLocalName(opf, "creator")[0]?.textContent?.trim() ?? "";
  const spine = getElementsByLocalName(opf, "itemref")
    .map((item) => manifest.get(item.getAttribute("idref") ?? ""))
    .filter((item): item is ManifestItem => Boolean(item));

  const chapters: EpubPreviewChapter[] = [];
  let textLength = 0;
  let skippedChapterCount = 0;
  let truncated = false;
  for (const [index, item] of spine.entries()) {
    const chapterBytes = getEntry(item.href);
    if (!/html|xhtml/.test(item.type) || !chapterBytes) continue;
    try {
      let text = extractHtmlText(parse(new TextDecoder().decode(chapterBytes)) as HtmlNode)
        .replace(/[\t ]+/g, " ")
        .replace(/\n\s*/g, "\n")
        .trim();
      if (!text) continue;
      if (textLength + text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, Math.max(0, MAX_TEXT_LENGTH - textLength));
        truncated = true;
      }
      if (text) {
        chapters.push({
          title: text.split("\n")[0].slice(0, 120) || `章节 ${index + 1}`,
          text
        });
        textLength += text.length;
      }
      if (truncated) break;
    } catch {
      skippedChapterCount += 1;
    }
  }
  if (chapters.length === 0) {
    throw new EpubWorkerError("invalidEpub", "EPUB contains no readable chapters.");
  }

  const coverId = getElementsByLocalName(opf, "meta")
    .find((item) => item.getAttribute("name") === "cover")
    ?.getAttribute("content") ?? "";
  const cover = manifest.get(coverId) ?? Array.from(manifest.values()).find((item) => (
    item.properties.split(/\s+/).includes("cover-image")
  ));

  return {
    title,
    creator,
    chapters,
    navigationCount: 0,
    skippedChapterCount,
    truncated,
    coverDataUrl: await renderCover(cover ? getEntry(cover.href) : undefined)
  };
};

void run()
  .then((data) => parentPort?.postMessage({ ok: true, data } satisfies EpubWorkerResponse))
  .catch((error) => parentPort?.postMessage({
    ok: false,
    reason: error instanceof EpubWorkerError ? error.reason : "invalidEpub",
    message: String(error?.message || error)
  } satisfies EpubWorkerResponse));
