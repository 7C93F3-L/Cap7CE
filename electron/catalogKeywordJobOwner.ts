import type { IpcMainInvokeEvent } from "electron";
import type { CatalogAutoKeywordPhase } from "../src/shared/catalogAutoKeywordTypes";

export function createKeywordJobOwner() {
  let active: { id: string; sender: number; controller: AbortController; saving: boolean; batch: boolean } | null = null;
  return {
    async run<T>(event: IpcMainInvokeEvent, id: string, batch: boolean, busy: T,
      operation: (signal: AbortSignal, phase: (value: CatalogAutoKeywordPhase | "collecting") => void) => Promise<T>): Promise<T> {
      if (active) return busy;
      const job = { id, sender: event.sender.id, controller: new AbortController(), saving: false, batch };
      active = job;
      const destroyed = () => job.controller.abort(); event.sender.once("destroyed", destroyed);
      try { return await operation(job.controller.signal, value => { job.saving = value === "saving"; }); }
      finally { event.sender.removeListener("destroyed", destroyed); if (active === job) active = null; }
    },
    cancel(event: IpcMainInvokeEvent, id: string) {
      if (!active || active.id !== id || active.sender !== event.sender.id || active.saving && !active.batch) return false;
      active.controller.abort(); return true;
    }
  };
}
