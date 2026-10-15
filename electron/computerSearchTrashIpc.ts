import { BrowserWindow, dialog, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { DeleteFilesResult } from "./fileOperationService";
import { t } from "./localization";

const confirmTrash = async (event: IpcMainInvokeEvent, items: readonly ComputerSearchItem[]) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  if (!parent) return false;
  const result = await dialog.showMessageBox(parent, { type: "warning", title: t("catalogActions.trashTitle"),
    message: t("catalogActions.trashQuestion", { count: items.length }), detail: items.slice(0, 3).map(item => item.name).join("\n"),
    buttons: [t("common.cancel"), t("common.delete")], defaultId: 0, cancelId: 0, noLink: true });
  return result.response === 1;
};
export function registerComputerSearchTrashIpc({ registrar, isSenderAllowed, resolveItems, confirm = confirmTrash,
  trash = async items => (await import("./computerSearchTrashService")).moveComputerSearchItemsToTrash(items) }: {
  registrar: IpcRegistrar; isSenderAllowed: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  resolveItems: (value: unknown) => ComputerSearchItem[];
  confirm?: typeof confirmTrash; trash?: (items: readonly ComputerSearchItem[]) => Promise<DeleteFilesResult>;
}) {
  let busy = false;
  registerIpcDomain({ registrar, isSenderAllowed, registrations: [{ kind: "handle", channel: "computerSearch:moveToTrash", listener: async (event, value) => {
    if (busy) throw new Error("computer-search-trash-busy");
    busy = true;
    try {
      const items = resolveItems(value);
      if (!await confirm(event, items)) return { success: false, totalCount: items.length, deletedPaths: [], failedItems: [] } satisfies DeleteFilesResult;
      return await trash(resolveItems(value));
    } finally { busy = false; }
  } }] });
}
