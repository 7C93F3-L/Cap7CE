import { listAiSearchCandidates } from "./aiSearchCandidateService";
import { AiSearchService } from "./aiSearchService";
import { listDirectories } from "./directoryStore";
import { ensureLlamaVisionRuntimeConnection } from "./llamaVisionRuntime";
import { ensureThumbnailPath } from "./thumbnailService";
import { prepareAiSearchImageDataUrl } from "./aiSearchImageInput";
import { requestAiSearchSingleImageScore } from "./aiSearchSingleImageModel";
import { getSelectedGgufModelId } from "./ggufModelStore";

export const aiSearchService = new AiSearchService({
  listCandidates: async (search, excludedFilePaths) => (
    listAiSearchCandidates(search, await listDirectories(), excludedFilePaths)
  ),
  ensureRuntime: ensureLlamaVisionRuntimeConnection,
  getModelId: getSelectedGgufModelId,
  prepareImage: async (filePath) => prepareAiSearchImageDataUrl(await ensureThumbnailPath(filePath, "interactive")),
  scoreImage: requestAiSearchSingleImageScore,
  saveEvidence: async () => undefined
});
