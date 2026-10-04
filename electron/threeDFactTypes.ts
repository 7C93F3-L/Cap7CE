export const THREE_D_FACT_EXTRACTOR_VERSION = 1;

export const supportedThreeDFactExtensions = [".glb", ".gltf", ".obj", ".stl"] as const;

export interface ThreeDFactCandidate { filePath: string; sourceRevision: string }
export interface ThreeDFactResult {
  sourceRevision: string;
  extractorVersion: number;
  status: "indexed" | "failed";
  triangleCountKnown: boolean;
  triangleCount: number;
  animationKnown: boolean;
  hasAnimation: boolean;
  rigKnown: boolean;
  hasRig: boolean;
  errorCode: string;
}
export interface ThreeDFactWriteRecord { filePath: string; result: ThreeDFactResult }
