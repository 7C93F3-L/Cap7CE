import { createCatalogAutoKeywordService } from "./catalogAutoKeywordService";
import type { CatalogKeywordsApi } from "./catalogKeywordsRuntime";
import { prepareTemporaryModelInputImage } from "./visualRenderService";
import { beginLlamaRuntimeAiUse, endLlamaRuntimeAiUse } from "./llamaRuntimeManager";
import { ensureLlamaVisionRuntimeConnection } from "./llamaVisionRuntime";
import { generateImageKeywords } from "./catalogAutoKeywordModel";
import { fingerprintKeywordSource } from "./catalogAutoKeywordSource";

export function createCatalogAutoKeywordRuntime(keywords: CatalogKeywordsApi) {
  return createCatalogAutoKeywordService({ keywords,
    fingerprint: fingerprintKeywordSource,
    prepareImage: async path => {
      const image = await prepareTemporaryModelInputImage(path);
      return `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
    },
    beginUse: beginLlamaRuntimeAiUse, endUse: endLlamaRuntimeAiUse,
    recognize: async (image, signal, starting, generating) => {
      starting();
      const connection = await ensureLlamaVisionRuntimeConnection();
      if (signal.aborted) throw Error("cancelled");
      generating(); return generateImageKeywords(connection, image, signal);
    }
  });
}
