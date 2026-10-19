import path from "node:path";
import * as font from "./font";
import * as epub from "./epub";
import * as mobi from "./mobi";
import * as archive from "./archive";
import * as pdf from "./pdf";
import { releasePreviewWorkers } from "./lifecycle";
export function createProviderPreviewService() {
  let closed = false, releasing: Promise<void> | undefined; const pending = new Set<Promise<unknown>>();
  const invalid = (): never => { throw Error("core-preview-invalid-request"); };
  const text = (value: unknown, file = false) => typeof value === "string" && value.length > 0 && value.length <= 32767 && !value.includes("\0") && (!file || path.isAbsolute(value)) ? value : invalid();
  const closeSessions = (all = false) => { font.closeFontPreviewSession(); epub.closeEpubPreviewSession(); mobi.closeMobiPreviewSession(); archive.closeArchivePreviewSession(); if (all) pdf.closePdfPreviewSession(); else pdf.releasePdfPreviewSourceHandles(); };
  const release = () => releasing ??= (async () => { closeSessions(); await releasePreviewWorkers(); await Promise.allSettled([...pending]); await releasePreviewWorkers(); })().finally(() => { releasing = undefined; });
  const execute = async (method: string, args: unknown[]): Promise<unknown> => {
    if (args.length < 1) return invalid(); const session = text(args[0]);
    if (method.endsWith(".close")) { if (args.length !== 1) return invalid(); switch (method) { case "font.close": return font.closeFontPreviewSession(session); case "epub.close": return epub.closeEpubPreviewSession(session); case "mobi.close": return mobi.closeMobiPreviewSession(session); case "archive.close": return archive.closeArchivePreviewSession(session); case "pdf.close": return pdf.closePdfPreviewSession(session); default: return invalid(); } }
    if (method === "font.inspect") { if (args.length !== 1) return invalid(); return font.inspectFontPreviewSource(text(args[0], true)); }
    if (args.length < 2) return invalid(); const file = text(args[1], true);
    switch (method) {
      case "font.open": if (args.length !== 3 || !["zh-CN", "en-US"].includes(String(args[2]))) return invalid(); return font.openFontPreviewSession(session, file, args[2] as "zh-CN" | "en-US");
      case "epub.open": if (args.length !== 2) return invalid(); return epub.openEpubPreviewSession(session, file);
      case "mobi.open": if (args.length !== 2) return invalid(); return mobi.openMobiPreviewSession(session, file);
      case "archive.open": if (args.length !== 2) return invalid(); return archive.openArchivePreviewSession(session, file);
      case "pdf.open": if (args.length !== 3) return invalid(); return pdf.openPdfPreviewSession(session, file, text(args[2], true));
      case "pdf.render": if (args.length !== 3 || !Number.isSafeInteger(args[2])) return invalid(); return { base64: (await pdf.renderPdfPreviewPage(session, file, args[2] as number)).toString("base64") };
      default: return invalid();
    }
  };
  return {
    async dispatch(method: unknown, args: unknown[]): Promise<unknown> {
      if (closed || !Array.isArray(args) || typeof method !== "string") return invalid();
      if (method === "releaseSourceHandles") { if (args.length) return invalid(); return release(); }
      if (releasing) throw Error("core-preview-releasing");
      if (pending.size >= 16) throw Error("core-preview-busy");
      const work = execute(method, args).catch(error => { if (typeof error?.reason === "string") error.code = "preview:" + error.reason; throw error; }); pending.add(work);
      try { return await work; } finally { pending.delete(work); }
    },
    async close() { closed = true; closeSessions(true); await release(); }
  };
}
