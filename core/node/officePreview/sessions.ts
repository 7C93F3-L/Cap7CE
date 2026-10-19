import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { OfficePreviewKind } from "../../../src/shared/officePreviewTypes";
import type { OfficePreviewCache } from "./cache";
import { runPowerShellConversion, createCancelledError, type OfficeConversionRunner } from "./conversion";
import { isValidPdf } from "./pdfHeader";
const maximumOfficePreviewBytes = 256 * 1024 * 1024;
interface OfficePreviewSession {
  sessionId: string;
  sourcePath: string;
  directoryPath: string | null;
  outputPath: string;
  controller: AbortController;
  disposed: boolean;
  releaseCache?: () => void;
}

export function createOfficePreviewService(cache: OfficePreviewCache, defaultRunner: OfficeConversionRunner = runPowerShellConversion) {
 const { officePreviewRoot, officePreviewCacheRoot, getOfficePreviewCacheGeneration, publishOfficePreviewCache, clearOfficePreviewCacheFiles, acquireOfficePreviewCache } = cache;
const sessionRoot = path.resolve(process.env.CAP7CE_CORE_SCRATCH_ROOT ?? officePreviewRoot);
const removals = new Set<Promise<void>>();
let pendingSessionId: string | null = null;
let activeSession: OfficePreviewSession | null = null;
let sessionRequestId = 0;
let conversionRunnerForTests: OfficeConversionRunner | null = null;
let conversionRunnerVersion = 0;

const getOfficePreviewKind = (filePath: string): OfficePreviewKind | null => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".xls" || extension === ".xlsx") return "excel";
  if (extension === ".ppt" || extension === ".pptx") return "powerpoint";
  return null;
};

const removeSessionDirectory = (directoryPath: string) => {
  if (path.dirname(path.resolve(directoryPath)) !== sessionRoot || !path.basename(directoryPath).startsWith("session-")) throw Error("core-office-invalid-cleanup");
  const work = fs.rm(directoryPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => undefined).finally(() => removals.delete(work));
  removals.add(work); return work;
};

const disposeSession = (session: OfficePreviewSession) => {
  if (session.disposed) return;
  session.disposed = true;
  session.releaseCache?.();
  session.controller.abort();
  if (session.directoryPath) void removeSessionDirectory(session.directoryPath);
};

const getOfficePreviewCachePath = (
  sourcePath: string,
  sourceSize: number,
  sourceModifiedAt: number,
  kind: OfficePreviewKind
) => {
  const cacheKey = crypto
    .createHash("sha256")
    .update(`${sourcePath}\0${sourceSize}\0${sourceModifiedAt}\0${kind}\0${conversionRunnerVersion}`)
    .digest("hex");
  return path.join(officePreviewCacheRoot, `${cacheKey}.pdf`);
};

const prepareOfficePreviewTemporaryRoot = async () => {
  await fs.rm(officePreviewRoot, { recursive: true, force: true });
  await fs.mkdir(officePreviewCacheRoot, { recursive: true });
};

const closeOfficePreviewSession = (sessionId?: string) => {
  const matchesPending = !!pendingSessionId && (!sessionId || pendingSessionId === sessionId);
  const matchesActive = !!activeSession && (!sessionId || activeSession.sessionId === sessionId);
  if (!matchesPending && !matchesActive) return false;
  sessionRequestId += 1;
  if (matchesPending) pendingSessionId = null;
  if (matchesActive) { const session = activeSession!; activeSession = null; disposeSession(session); }
  return true;
};

const clearOfficePreviewCache = () => clearOfficePreviewCacheFiles();

const openOfficePreviewSession = async (sessionId: string, filePath: string) => {
  closeOfficePreviewSession();
  const requestId = ++sessionRequestId;
  pendingSessionId = sessionId;
  try {
  const cacheGeneration = getOfficePreviewCacheGeneration();
  const normalizedPath = path.normalize(path.resolve(filePath));
  if (!path.isAbsolute(filePath)) throw new Error("Office preview requires an absolute path.");
  const kind = getOfficePreviewKind(normalizedPath);
  if (!kind) throw new Error("Office preview format is unsupported.");
  const stat = await fs.stat(normalizedPath);
  if (!stat.isFile()) throw new Error("Office preview source is unavailable.");
  if (stat.size > maximumOfficePreviewBytes) {
    throw new Error(`Office preview file exceeds ${maximumOfficePreviewBytes} bytes.`);
  }
  if (requestId !== sessionRequestId) throw createCancelledError();

  await fs.mkdir(officePreviewCacheRoot, { recursive: true });
  const cachePath = getOfficePreviewCachePath(normalizedPath, stat.size, stat.mtimeMs, kind);
  const releaseCache = await acquireOfficePreviewCache(cachePath, () => isValidPdf(cachePath));
  if (requestId !== sessionRequestId) { releaseCache?.(); throw createCancelledError(); }
  if (releaseCache) {
    const session: OfficePreviewSession = {
      sessionId,
      sourcePath: normalizedPath,
      directoryPath: null,
      outputPath: cachePath,
      controller: new AbortController(),
      disposed: false, releaseCache
    };
    activeSession = session;
    return { pdfPath: cachePath, kind };
  }

  await fs.mkdir(sessionRoot, { recursive: true });
  if (requestId !== sessionRequestId) throw createCancelledError();
  const directoryPath = await fs.mkdtemp(path.join(sessionRoot, "session-"));
  if (requestId !== sessionRequestId) { await removeSessionDirectory(directoryPath); throw createCancelledError(); }
  const outputPath = path.join(directoryPath, "preview.pdf");
  const session: OfficePreviewSession = {
    sessionId,
    sourcePath: normalizedPath,
    directoryPath,
    outputPath,
    controller: new AbortController(),
    disposed: false
  };
  activeSession = session;

  try {
    const runner = conversionRunnerForTests ?? defaultRunner;
    await runner(normalizedPath, outputPath, kind, session.controller.signal);
    if (requestId !== sessionRequestId || session.disposed || activeSession !== session) {
      throw createCancelledError();
    }
    if (!await isValidPdf(outputPath)) {
      throw new Error("Office preview conversion did not produce a PDF.");
    }
    await publishOfficePreviewCache(outputPath, cachePath, requestId, cacheGeneration);
    return { pdfPath: outputPath, kind };
  } catch (error) {
    if (activeSession === session) activeSession = null;
    disposeSession(session);
    throw error;
  }
  } finally { if (requestId === sessionRequestId) pendingSessionId = null; }
};

const setOfficePreviewConversionRunnerForTests = (runner: OfficeConversionRunner | null) => {
  closeOfficePreviewSession();
  conversionRunnerForTests = runner;
  conversionRunnerVersion += 1;
};

 return { prepareOfficePreviewTemporaryRoot, closeOfficePreviewSession, clearOfficePreviewCache, openOfficePreviewSession, setOfficePreviewConversionRunnerForTests, flush: () => Promise.allSettled([...removals]) };
}
