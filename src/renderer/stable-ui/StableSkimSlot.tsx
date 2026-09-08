import type { ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableSkimToolbar from "./StableSkimToolbar";
import type { StableSkimProps } from "./stableSkimTypes";
import "./StableSkimPanel.css";

type StableSkimSlotProps = Omit<StableSkimProps, "renderContent" | "onOpen"> & { content: ReactNode; onToggleSkim: () => void };

const StableSkimSlot = ({ content, isLoading, feedback, entryCount, onToggleSkim, ...toolbarProps }: StableSkimSlotProps) => {
  const status = feedback || (isLoading ? t("skim.loading") : t("skim.entryCount", { count: entryCount }));

  return <aside className="cap-stable-skim-slot" aria-label={t("skim.name")}>
    <StableSkimToolbar {...toolbarProps} onToggleSkim={onToggleSkim} />
    <div className="cap-stable-skim-status" role="status">{status}</div>
    <div className="cap-stable-skim-content">{content}</div>
  </aside>;
};

export default StableSkimSlot;
