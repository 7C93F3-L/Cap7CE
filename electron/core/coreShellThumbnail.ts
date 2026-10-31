import { requestCoreShellThumbnail as request } from "../../core/artifacts/file-facts/core/node/visualRendering/shell/coreShellThumbnail";
import { coreVisualExecutable } from "./coreVisualResources";
// Preserve the old Shell's development/installed resource lookup at its boundary.
export const requestCoreShellThumbnail = (source: string, edge: number, executable = coreVisualExecutable(), timeoutMs = 15000): Promise<Buffer> =>
  request(source, edge, executable, timeoutMs);
