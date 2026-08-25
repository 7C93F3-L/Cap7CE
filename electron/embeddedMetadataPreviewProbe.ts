import path from "node:path";
import { Worker } from "node:worker_threads";
import { supportsEmbeddedMetadataExtraction } from "./embeddedMetadataExtractor";
import type { EmbeddedMetadataExtraction } from "./embeddedMetadataTypes";
import type { PreviewEmbeddedMetadata, PreviewWindowData } from "./previewTypes";

interface WorkerLike {
  on(event: "message" | "error" | "exit", listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
}

interface ProbeDependencies {
  createWorker?: () => WorkerLike;
  timeoutMs?: number;
}

export interface EmbeddedMetadataPreviewProbe {
  result: Promise<PreviewEmbeddedMetadata | null>;
  cancel: () => void;
}

export interface PreviewEmbeddedMetadataUpdate {
  sessionId: string;
  filePath: string;
  embeddedMetadata: PreviewEmbeddedMetadata;
}

interface CoordinatorDependencies {
  getActiveData: () => PreviewWindowData | null;
  publish: (update: PreviewEmbeddedMetadataUpdate) => void;
  probeDependencies?: ProbeDependencies;
}

const toPreviewMetadata = (extraction: EmbeddedMetadataExtraction): PreviewEmbeddedMetadata | null => {
  if (extraction.status !== "indexed") return null;
  const items = extraction.evidence.map((item) => ({ kind: item.kind, text: item.searchText }));
  if (items.length === 0 && !extraction.capturedAt) return null;
  return { items, capturedAt: extraction.capturedAt };
};

export const startEmbeddedMetadataPreviewProbe = (
  data: PreviewWindowData,
  {
    createWorker = () => new Worker(path.join(__dirname, "embeddedMetadataWorker.js")),
    timeoutMs = 8_000
  }: ProbeDependencies = {}
): EmbeddedMetadataPreviewProbe | null => {
  if (
    !data.skimActive
    || data.info?.kind !== "file"
    || data.embeddedMetadata
    || !supportsEmbeddedMetadataExtraction(data.filePath)
  ) return null;

  const worker = createWorker();
  let settled = false;
  let settle: (value: PreviewEmbeddedMetadata | null) => void = () => undefined;
  const result = new Promise<PreviewEmbeddedMetadata | null>((resolve) => {
    settle = resolve;
  });
  const finish = (value: PreviewEmbeddedMetadata | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    void worker.terminate().catch(() => undefined);
    settle(value);
  };
  const timeout = setTimeout(() => finish(null), Math.max(1, timeoutMs));

  worker.on("message", (message: { id?: number; extraction?: EmbeddedMetadataExtraction }) => {
    if (message.id !== 1 || !message.extraction) return;
    finish(toPreviewMetadata(message.extraction));
  });
  worker.on("error", () => finish(null));
  worker.on("exit", () => finish(null));
  worker.postMessage({ id: 1, filePath: data.filePath });

  return { result, cancel: () => finish(null) };
};

export const createEmbeddedMetadataPreviewCoordinator = ({ getActiveData, publish, probeDependencies }: CoordinatorDependencies) => {
  let activeProbe: EmbeddedMetadataPreviewProbe | null = null;
  const cancel = () => {
    activeProbe?.cancel();
    activeProbe = null;
  };
  const start = (data: PreviewWindowData, shouldProbe = true) => {
    cancel();
    if (!shouldProbe) return;
    const probe = startEmbeddedMetadataPreviewProbe(data, probeDependencies);
    activeProbe = probe;
    void probe?.result.then((embeddedMetadata) => {
      if (activeProbe !== probe) return;
      activeProbe = null;
      const activeData = getActiveData();
      if (
        !embeddedMetadata
        || activeData?.sessionId !== data.sessionId
        || activeData.filePath !== data.filePath
      ) return;
      publish({ sessionId: data.sessionId, filePath: data.filePath, embeddedMetadata });
    });
  };
  return { start, cancel };
};
