import type { ReactNode } from "react";
import { t } from "../../../electron/localization";
import StableSkimToolbar from "./StableSkimToolbar";
import type { StableSkimProps } from "./stableSkimTypes";
import "./StableSkimPanel.css";

type StableSkimSlotProps = Omit<StableSkimProps, "renderContent" | "onOpen"> & { content: ReactNode };

const StableSkimSlot = ({ content, isLoading, feedback, entryCount, ...toolbarProps }: StableSkimSlotProps) => {
  const status = feedback || (isLoading ? t("skim.loading") : t("skim.entryCount", { count: entryCount }));

  return <aside className="cap-stable-skim-slot" aria-label={t("skim.name")}>
    <StableSkimToolbar {...toolbarProps} />
    <div className="cap-stable-skim-status" role="status">{status}</div>
    <div className="cap-stable-skim-content">{content}</div>
  </aside>;
};

export default StableSkimSlot;
