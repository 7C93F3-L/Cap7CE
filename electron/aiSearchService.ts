import { aiQueryPromptVersion, type AiQueryEvidenceMerge } from "./aiQueryEvidenceStore";
import type { AiSearchVisualScore } from "./aiSearchSingleImageModel";
import { createFileSourceRevision } from "./fileSourceRevision";
import type { LlamaRuntimeConnection } from "./llamaRuntimeManager";
import type { ImageSearchResult, ImageSearchState } from "./sqliteImageIndex";
import { t } from "./localization";

const maximumConsecutiveFailures = 3;

export interface AiSearchStartRequest {
  sessionId: string;
  search: ImageSearchState;
  excludeFilePaths: string[];
}

export interface AiSearchStartResponse {
  accepted: boolean;
  totalCandidates: number;
  visualTerms: string[];
  resumed?: boolean;
  reason?: "empty_query" | "no_visual_terms" | "no_candidates";
}

export type AiSearchUpdate =
  | {
    type: "status";
    sessionId: string;
    phase: "starting" | "running" | "paused_user" | "completed" | "cancelled" | "failed";
    processed: number;
    total: number;
    message?: string;
  }
  | {
    type: "batch";
    sessionId: string;
    processed: number;
    total: number;
    matches: ImageSearchResult[];
  };

interface AiSearchCandidateSet {
  candidates: ImageSearchResult[];
  visualTerms: string[];
}

export interface AiSearchServiceDependencies {
  listCandidates: (
    search: ImageSearchState,
    excludedFilePaths: readonly string[]
  ) => Promise<AiSearchCandidateSet>;
  ensureRuntime: () => Promise<LlamaRuntimeConnection>;
  beginRuntimeUse?: () => void | Promise<void>;
  endRuntimeUse?: () => void;
  getModelId: () => Promise<string>;
  prepareImage: (filePath: string) => Promise<string>;
  scoreImage: (
    connection: LlamaRuntimeConnection,
    dataUrl: string,
    term: string,
    signal: AbortSignal
  ) => Promise<AiSearchVisualScore>;
  saveEvidence: (entries: AiQueryEvidenceMerge[]) => Promise<void>;
}

interface AiSearchSession {
  candidateSet: AiSearchCandidateSet;
  nextCandidateIndex: number;
  controller: AbortController | null;
  emit: (update: AiSearchUpdate) => void;
  phase: "starting" | "running" | "paused_user";
  runId: number;
  pauseRequested: boolean;
}

const withAiSearchEvidence = (item: ImageSearchResult, terms: string[]): ImageSearchResult => ({
  ...item,
  searchEvidence: {
    terms: terms.map((term) => ({ term, sources: ["aiSearch"], bestSource: "aiSearch" })),
    classification: "aiDeepMatch",
    weakestSource: "aiSearch",
    policy: "ai-search-cascade-v1",
    embeddedMatches: []
  }
});

const numericImageId = (candidate: ImageSearchResult) => {
  const imageId = Number(candidate.id);
  return Number.isSafeInteger(imageId) && imageId > 0 ? imageId : null;
};

export class AiSearchService {
  private readonly sessions = new Map<string, AiSearchSession>();

  constructor(private readonly dependencies: AiSearchServiceDependencies) {}

  async start(
    request: AiSearchStartRequest,
    emit: (update: AiSearchUpdate) => void
  ): Promise<AiSearchStartResponse> {
    const resumable = this.sessions.get(request.sessionId);
    if (resumable?.phase === "paused_user") {
      resumable.emit = emit;
      this.launch(request.sessionId, resumable);
      return {
        accepted: true,
        resumed: true,
        totalCandidates: resumable.candidateSet.candidates.length,
        visualTerms: resumable.candidateSet.visualTerms
      };
    }

    for (const session of this.sessions.values()) session.controller?.abort();
    this.sessions.clear();
    if (!request.search.query.trim()) {
      return { accepted: false, totalCandidates: 0, visualTerms: [], reason: "empty_query" };
    }
    const candidateSet = await this.dependencies.listCandidates(request.search, request.excludeFilePaths);
    if (candidateSet.visualTerms.length === 0) {
      return { accepted: false, totalCandidates: 0, visualTerms: [], reason: "no_visual_terms" };
    }
    if (candidateSet.candidates.length === 0) {
      return { accepted: false, totalCandidates: 0, visualTerms: candidateSet.visualTerms, reason: "no_candidates" };
    }

    const session: AiSearchSession = {
      candidateSet,
      nextCandidateIndex: 0,
      controller: null,
      emit,
      phase: "starting",
      runId: 0,
      pauseRequested: false
    };
    this.sessions.set(request.sessionId, session);
    this.launch(request.sessionId, session);
    return {
      accepted: true,
      resumed: false,
      totalCandidates: candidateSet.candidates.length,
      visualTerms: candidateSet.visualTerms
    };
  }

  cancel(sessionId: string, discard = false) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (discard) this.sessions.delete(sessionId);
    session.pauseRequested = true;
    session.controller?.abort();
    return true;
  }

  private launch(sessionId: string, session: AiSearchSession) {
    session.controller?.abort();
    session.controller = new AbortController();
    session.pauseRequested = false;
    session.phase = "starting";
    session.runId += 1;
    void this.run(sessionId, session, session.runId, session.controller.signal);
  }

  private async persistEvidence(entries: AiQueryEvidenceMerge[]) {
    if (entries.length === 0) return;
    try {
      await this.dependencies.saveEvidence(entries);
    } catch (error) {
      console.warn("[ai-search] query evidence cache write failed", error);
    }
  }

  private async run(sessionId: string, session: AiSearchSession, runId: number, signal: AbortSignal) {
    const { candidateSet } = session;
    const total = candidateSet.candidates.length;
    let consecutiveFailures = 0;
    const isCurrent = () => this.sessions.get(sessionId) === session && session.runId === runId;
    const emitStatus = (phase: Extract<AiSearchUpdate, { type: "status" }>["phase"], message?: string) => {
      if (!isCurrent()) return;
      session.phase = phase === "paused_user" ? phase : session.phase;
      session.emit({
        type: "status",
        sessionId,
        phase,
        processed: session.nextCandidateIndex,
        total,
        message
      });
    };
    let runtimeUseStarted = false;

    try {
      emitStatus("starting");
      await this.dependencies.beginRuntimeUse?.();
      runtimeUseStarted = true;
      if (signal.aborted) throw Object.assign(new Error("AI search paused."), { name: "AbortError" });
      const [connection, modelId] = await Promise.all([
        this.dependencies.ensureRuntime(),
        this.dependencies.getModelId()
      ]);
      if (signal.aborted) throw Object.assign(new Error("AI search paused."), { name: "AbortError" });
      emitStatus("running");

      while (session.nextCandidateIndex < total) {
        if (signal.aborted) throw Object.assign(new Error("AI search paused."), { name: "AbortError" });
        const candidate = candidateSet.candidates[session.nextCandidateIndex];
        const confirmedTerms: string[] = [];
        let matchesAllTerms = true;
        try {
          const dataUrl = await this.dependencies.prepareImage(candidate.filePath);
          for (const term of candidateSet.visualTerms) {
            const score = await this.dependencies.scoreImage(connection, dataUrl, term, signal);
            if (score !== 2) {
              matchesAllTerms = false;
              break;
            }
            confirmedTerms.push(term);
          }
          consecutiveFailures = 0;
        } catch (error) {
          if (signal.aborted) throw error;
          matchesAllTerms = false;
          consecutiveFailures += 1;
          console.warn("[ai-search] skipped candidate", {
            filePath: candidate.filePath,
            message: error instanceof Error ? error.message : String(error)
          });
          if (consecutiveFailures >= maximumConsecutiveFailures) {
            throw new Error(t("search.aiConsecutiveInvalidResults"));
          }
        }

        session.nextCandidateIndex += 1;
        const imageId = numericImageId(candidate);
        if (imageId !== null && matchesAllTerms && confirmedTerms.length === candidateSet.visualTerms.length) {
          await this.persistEvidence([{
            imageId,
            keywords: confirmedTerms,
            sourceRevision: createFileSourceRevision({ fileSize: candidate.fileSize, modifiedAt: candidate.modifiedAt }),
            modelId,
            promptVersion: aiQueryPromptVersion
          }]);
        }
        if (matchesAllTerms && confirmedTerms.length === candidateSet.visualTerms.length) {
          session.emit({
            type: "batch",
            sessionId,
            processed: session.nextCandidateIndex,
            total,
            matches: [withAiSearchEvidence(candidate, candidateSet.visualTerms)]
          });
        }
        emitStatus("running");
      }
      emitStatus("completed");
      if (isCurrent()) this.sessions.delete(sessionId);
    } catch (error) {
      if (!isCurrent()) return;
      if (signal.aborted) {
        emitStatus(session.pauseRequested ? "paused_user" : "cancelled");
      } else {
        emitStatus("failed", error instanceof Error ? error.message : t("search.aiFailed"));
        this.sessions.delete(sessionId);
      }
    } finally {
      if (isCurrent()) session.controller = null;
      if (runtimeUseStarted) this.dependencies.endRuntimeUse?.();
    }
  }
}
