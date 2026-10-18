import { createContext, useContext, type ReactNode, type SyntheticEvent } from "react";
import "./StableMetadataFilterGate.css";

const UnavailableAction = createContext<(() => void) | undefined>(undefined);
const editKeys = new Set(["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

// Keep unavailable controls discoverable without letting their events change a filter or open a flyout.
export default function StableMetadataFilterGate({ unavailable, onUnavailable, className, children }: {
  unavailable: boolean; onUnavailable?: () => void; className: string; children: ReactNode;
}) {
  const inherited = useContext(UnavailableAction), notify = onUnavailable ?? inherited;
  const blocked = unavailable && Boolean(notify);
  const stop = (event: SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <UnavailableAction.Provider value={notify}><fieldset className={className} aria-disabled={unavailable || undefined} disabled={unavailable && !notify}
    onClickCapture={event => { if (blocked && (event.target as Element).closest("button, input, select")) { stop(event); notify?.(); } }}
    onPointerDownCapture={event => { if (blocked && (event.target as Element).closest("input, select")) stop(event); }}
    onKeyDownCapture={event => { if (blocked && editKeys.has(event.key)) { stop(event); if (!event.repeat && (event.key === "Enter" || event.key === " ")) notify?.(); } }}
    onChangeCapture={event => { if (blocked) stop(event); }}>
    {children}
  </fieldset></UnavailableAction.Provider>;
}
