import { officePreviewTempRoot } from "../officePreviewPaths";
import { createCorePreviewNodeSession } from "./corePreviewNodeSession";
const session = createCorePreviewNodeSession(() => officePreviewTempRoot, "office-preview.cjs", 40000);
export const requestCoreOfficePreview = session.request, releaseCoreOfficePreview = session.release, closeCoreOfficePreview = session.close;
