import path from "node:path";
import { t } from "../../../electron/localization";
import type { GgufModelFileKind, GgufModelFile, GgufVisionModel } from "../../../src/shared/modelSettingsTypes";
const modelIdentityTokens = (fileName: string, kind: GgufModelFileKind) => {
  const ignoredTokens = new Set([
    "gguf", "mmproj", "instruct", "chat", "vision", "projector", "f16", "f32", "bf16",
    "q2", "q3", "q4", "q5", "q6", "q8", "k", "m", "s", "l", "xs"
  ]);
  const baseName = path.parse(fileName).name
    .toLowerCase()
    .replace(/q\d+(?:_[a-z0-9]+)*/g, " ")
    .replace(/f(?:16|32)/g, " ");
  const tokens = baseName.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.filter((token) => !ignoredTokens.has(token) && (kind === "model" || token !== "mmproj"));
};

const pairingScore = (modelFile: GgufModelFile, mmprojFile: GgufModelFile) => {
  const modelDirectory = path.posix.dirname(modelFile.relativePath.toLowerCase());
  const mmprojDirectory = path.posix.dirname(mmprojFile.relativePath.toLowerCase());
  const sameDirectoryScore = modelDirectory === mmprojDirectory ? 100 : 0;
  const modelTokens = new Set(modelIdentityTokens(modelFile.name, "model"));
  const mmprojTokens = modelIdentityTokens(mmprojFile.name, "mmproj");
  const sharedTokens = mmprojTokens.filter((token) => modelTokens.has(token)).length;
  const mismatchedTokens = mmprojTokens.filter((token) => !modelTokens.has(token)).length;
  return sameDirectoryScore + sharedTokens * 10 - mismatchedTokens * 3;
};

export const pairVisionModels = (files: GgufModelFile[]): GgufVisionModel[] => {
  const modelFiles = files.filter((file) => file.kind === "model");
  const mmprojFiles = files.filter((file) => file.kind === "mmproj");

  return modelFiles.map((modelFile) => {
    const rankedCandidates = mmprojFiles
      .map((mmprojFile) => ({
        mmprojFile,
        score: pairingScore(modelFile, mmprojFile)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score
        || left.mmprojFile.relativePath.localeCompare(right.mmprojFile.relativePath));
    const bestCandidate = rankedCandidates[0];
    const secondCandidate = rankedCandidates[1];
    const mmprojFile = bestCandidate
      && (!secondCandidate || bestCandidate.score > secondCandidate.score)
      ? bestCandidate.mmprojFile
      : undefined;

    return {
      id: modelFile.id,
      name: modelFile.name,
      modelFile,
      ...(mmprojFile ? { mmprojFile } : {}),
      pairingStatus: mmprojFile ? "paired" : "missing_mmproj",
      loadable: Boolean(mmprojFile),
      ...(!mmprojFile ? { message: t("model.mmprojNotFound") } : {})
    };
  });
};

