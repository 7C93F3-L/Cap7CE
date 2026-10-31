import { readThreeDFact } from "../fileFacts/domain/threeDFactExtractor";
import type { MetadataThreeDProperties } from "./metadataWorkerTypes";

// Runs only in the owned OS helper; never follows external glTF buffers.
export const inspectThreeDMetadata = async (filePath: string, signal: AbortSignal): Promise<MetadataThreeDProperties | undefined> => {
  signal.throwIfAborted();
  const fact = await readThreeDFact(filePath);
  signal.throwIfAborted();
  const properties: MetadataThreeDProperties = {
    ...(fact.triangleCountKnown ? { triangleCount: fact.triangleCount } : {}),
    ...(fact.animationKnown ? { hasAnimation: fact.hasAnimation } : {}),
    ...(fact.rigKnown ? { hasRig: fact.hasRig } : {})
  };
  return Object.keys(properties).length ? properties : undefined;
};
