import { t } from "../../../electron/localization";
import type { KeyboardEvent } from "react";
import type { ResultDisplaySection } from "./resultSectionLayout";

export type AiResultSectionPhase = "idle" | "starting" | "running" | "paused_user" | "completed" | "cancelled" | "failed";

const sectionTextKeys: Record<ResultDisplaySection, { title: Parameters<typeof t>[0]; description: Parameters<typeof t>[0] }> = {
  fastMatch: {
    title: "search.section.fastMatch.title",
    description: "search.section.fastMatch.description"
  },
  possibleSimilarity: {
    title: "search.section.possibleSimilarity.title",
    description: "search.section.possibleSimilarity.description"
  },
  aiDeepMatch: {
    title: "search.section.aiDeepMatch.title",
    description: "search.section.aiDeepMatch.description"
  }
};

const aiStatusTextKeys: Partial<Record<AiResultSectionPhase, { title: Parameters<typeof t>[0]; description: Parameters<typeof t>[0] }>> = {
  starting: { title: "search.section.aiMatching.title", description: "search.section.aiMatching.description" },
  running: { title: "search.section.aiMatching.title", description: "search.section.aiMatching.description" },
  paused_user: { title: "search.section.aiPaused.title", description: "search.section.aiPaused.description" },
  completed: { title: "search.section.aiDeepMatch.title", description: "search.section.aiDeepMatch.completedDescription" }
};

export const ResultSectionCard = ({ section, aiPhase = "idle", onAiToggle }: {
  section: ResultDisplaySection;
  aiPhase?: AiResultSectionPhase;
  onAiToggle?: () => void;
}) => {
  const text = section === "aiDeepMatch" ? aiStatusTextKeys[aiPhase] ?? sectionTextKeys[section] : sectionTextKeys[section];
  const interactive = section === "aiDeepMatch" && Boolean(onAiToggle) && ["starting", "running", "paused_user"].includes(aiPhase);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onAiToggle?.();
  };
  return (
    <article
      className={`result-section-card result-section-card-${section}`}
      data-result-section={section}
      data-ai-phase={section === "aiDeepMatch" ? aiPhase : undefined}
      data-interactive={interactive || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onAiToggle : undefined}
      onKeyDown={handleKeyDown}
    >
      <h2>{t(text.title)}<span aria-hidden="true">›</span></h2>
      <p>{t(text.description)}</p>
    </article>
  );
};
