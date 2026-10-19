import os from "node:os";
import { createCorePreviewNodeSession } from "./corePreviewNodeSession";
const session = createCorePreviewNodeSession(os.tmpdir, "provider-preview.cjs");
export const requestCoreProviderPreview = session.request, releaseCoreProviderPreview = session.release, closeCoreProviderPreview = session.close;
