import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";

const maximumPdfBytes = 256 * 1024 * 1024;
const maximumRenderedPixels = 16_000_000;
const maximumCanvasAreaBytes = 64 * 1024 * 1024;
const maximumPageDimension = 1600;
const maximumCachedPages = 5;

type PdfJsModule = typeof import("pdfjs-dist");

const importEsmModule = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<PdfJsModule>;

let pdfJsPromise: Promise<PdfJsModule> | null = null;

const loadPdfJs = () => (
  pdfJsPromise ??= importEsmModule("pdfjs-dist/legacy/build/pdf.mjs")
);

export interface PdfPreviewMetadata {
  pageCount: number;
  defaultPageWidth: number;
  defaultPageHeight: number;
}

interface PdfPreviewSession {
  sessionId: string;
  filePath: string;
  loadingTask: PDFDocumentLoadingTask;
  document: PDFDocumentProxy | null;
  disposed: boolean;
  renderQueue: Promise<void>;
  activeRenderTask: RenderTask | null;
  cache: Map<number, Buffer>;
  inFlight: Map<number, Promise<Buffer>>;
}

let activeSession: PdfPreviewSession | null = null;
let sessionRequestId = 0;
let pendingSessionId: string | null = null;

const normalizeFilePath = (filePath: string) => path.normalize(path.resolve(filePath));
const filePathsEqual = (left: string, right: string) => (
  process.platform === "win32"
    ? normalizeFilePath(left).toLowerCase() === normalizeFilePath(right).toLowerCase()
    : normalizeFilePath(left) === normalizeFilePath(right)
);

const createCancelledError = () => Object.assign(new Error("PDF preview session was cancelled."), {
  code: "ECANCELED"
});

const disposeSession = (session: PdfPreviewSession) => {
  if (session.disposed) return;
  session.disposed = true;
  session.activeRenderTask?.cancel();
  session.cache.clear();
  session.inFlight.clear();
  if (session.document) {
    void session.document.destroy().catch(() => undefined);
  } else {
    void session.loadingTask.destroy().catch(() => undefined);
  }
};

const disposeActiveSession = (sessionId?: string) => {
  if (!activeSession || (sessionId && activeSession.sessionId !== sessionId)) {
    return false;
  }
  const session = activeSession;
  activeSession = null;
  disposeSession(session);
  return true;
};

export const closePdfPreviewSession = (sessionId?: string) => {
  const matchesPending = Boolean(pendingSessionId && (!sessionId || pendingSessionId === sessionId));
  const matchesActive = Boolean(activeSession && (!sessionId || activeSession.sessionId === sessionId));
  if (!matchesPending && !matchesActive) return false;
  sessionRequestId += 1;
  if (matchesPending) pendingSessionId = null;
  if (matchesActive) disposeActiveSession(sessionId);
  return true;
};

export const openPdfPreviewSession = async (
  sessionId: string,
  filePath: string
): Promise<PdfPreviewMetadata> => {
  const requestId = ++sessionRequestId;
  pendingSessionId = sessionId;
  disposeActiveSession();
  let normalizedPath: string;
  let loadingTask: PDFDocumentLoadingTask;
  try {
    normalizedPath = normalizeFilePath(filePath);
    if (path.extname(normalizedPath).toLowerCase() !== ".pdf") {
      throw new Error("PDF preview requires a PDF file.");
    }
    const stat = await fs.stat(normalizedPath);
    if (!stat.isFile()) throw new Error("PDF preview source is unavailable.");
    if (stat.size > maximumPdfBytes) {
      throw new Error(`PDF 文件超过安全大小上限 ${maximumPdfBytes} 字节。`);
    }

    const sourceData = new Uint8Array(await fs.readFile(normalizedPath));
    if (requestId !== sessionRequestId || pendingSessionId !== sessionId) {
      throw createCancelledError();
    }

    const { getDocument } = await loadPdfJs();
    if (requestId !== sessionRequestId || pendingSessionId !== sessionId) {
      throw createCancelledError();
    }
    loadingTask = getDocument({
      data: sourceData,
      disableAutoFetch: true,
      disableRange: true,
      disableStream: true,
      enableXfa: false,
      isEvalSupported: false,
      maxImageSize: -1,
      canvasMaxAreaInBytes: maximumCanvasAreaBytes,
      stopAtErrors: true,
      useSystemFonts: true,
      useWorkerFetch: false
    });
  } catch (error) {
    if (pendingSessionId === sessionId) pendingSessionId = null;
    throw error;
  }
  const session: PdfPreviewSession = {
    sessionId,
    filePath: normalizedPath,
    loadingTask,
    document: null,
    disposed: false,
    renderQueue: Promise.resolve(),
    activeRenderTask: null,
    cache: new Map(),
    inFlight: new Map()
  };
  activeSession = session;

  try {
    const document = await loadingTask.promise;
    if (requestId !== sessionRequestId || session.disposed || activeSession !== session) {
      await document.destroy().catch(() => undefined);
      throw createCancelledError();
    }
    session.document = document;
    if (document.numPages < 1) throw new Error("PDF 不包含可渲染页面。");
    const firstPage = await document.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    firstPage.cleanup();
    if (pendingSessionId === sessionId) pendingSessionId = null;
    return {
      pageCount: document.numPages,
      defaultPageWidth: Math.max(1, Math.round(viewport.width)),
      defaultPageHeight: Math.max(1, Math.round(viewport.height))
    };
  } catch (error) {
    if (pendingSessionId === sessionId) pendingSessionId = null;
    if (activeSession === session) activeSession = null;
    disposeSession(session);
    throw error;
  }
};

const getCachedPage = (session: PdfPreviewSession, pageNumber: number) => {
  const cached = session.cache.get(pageNumber);
  if (!cached) return null;
  session.cache.delete(pageNumber);
  session.cache.set(pageNumber, cached);
  return cached;
};

const cachePage = (session: PdfPreviewSession, pageNumber: number, buffer: Buffer) => {
  session.cache.delete(pageNumber);
  session.cache.set(pageNumber, buffer);
  while (session.cache.size > maximumCachedPages) {
    const oldestPage = session.cache.keys().next().value as number | undefined;
    if (oldestPage === undefined) break;
    session.cache.delete(oldestPage);
  }
};

const renderPage = async (session: PdfPreviewSession, pageNumber: number) => {
  if (session.disposed || activeSession !== session || !session.document) {
    throw createCancelledError();
  }
  const page = await session.document.getPage(pageNumber);
  try {
    const sourceViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      maximumPageDimension / sourceViewport.width,
      maximumPageDimension / sourceViewport.height
    );
    const viewport = page.getViewport({ scale: Math.max(scale, 0.01) });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    if (width * height > maximumRenderedPixels) {
      throw new Error(`PDF 页面面积超过安全像素上限 ${maximumRenderedPixels}。`);
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    const renderTask = page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    });
    session.activeRenderTask = renderTask;
    await renderTask.promise;
    if (session.disposed || activeSession !== session) throw createCancelledError();
    return Buffer.from(await canvas.encode("png"));
  } finally {
    session.activeRenderTask = null;
    page.cleanup();
  }
};

export const renderPdfPreviewPage = async (
  sessionId: string,
  filePath: string,
  pageNumber: number
) => {
  const session = activeSession;
  if (
    !session
    || session.disposed
    || session.sessionId !== sessionId
    || !filePathsEqual(session.filePath, filePath)
    || !Number.isInteger(pageNumber)
    || !session.document
    || pageNumber < 1
    || pageNumber > session.document.numPages
  ) {
    throw new Error("PDF preview page is unavailable.");
  }
  const cached = getCachedPage(session, pageNumber);
  if (cached) return cached;
  const pending = session.inFlight.get(pageNumber);
  if (pending) return pending;

  let resolvePage!: (buffer: Buffer) => void;
  let rejectPage!: (error: unknown) => void;
  const result = new Promise<Buffer>((resolve, reject) => {
    resolvePage = resolve;
    rejectPage = reject;
  });
  session.inFlight.set(pageNumber, result);
  const queuedRender = session.renderQueue.then(async () => {
    try {
      const cachedAfterWait = getCachedPage(session, pageNumber);
      const buffer = cachedAfterWait ?? await renderPage(session, pageNumber);
      if (!cachedAfterWait) cachePage(session, pageNumber, buffer);
      resolvePage(buffer);
    } catch (error) {
      rejectPage(error);
    } finally {
      session.inFlight.delete(pageNumber);
    }
  });
  session.renderQueue = queuedRender.catch(() => undefined);
  return result;
};
