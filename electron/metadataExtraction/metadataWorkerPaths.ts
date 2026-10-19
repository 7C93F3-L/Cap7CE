import path from "node:path";

// Resource layout is also consumable by Core/another shell; no ASAR or installed Node dependency.
export const metadataWorkerPaths = () => {
  const packaged = Boolean(process.resourcesPath && !process.defaultApp);
  const root = packaged ? path.join(process.resourcesPath, "metadata-worker/v1")
    : path.resolve(__dirname, "../../artifacts/metadata-worker/v1");
  return { executable: path.join(root, "node.exe"), worker: path.join(root, "worker.cjs"),
    videoHelper: packaged ? path.join(process.resourcesPath, "metadata-media/v1/Cap7CE.Media.Metadata.exe")
      : path.resolve(__dirname, "../../native/artifacts/metadata-media/v1/Cap7CE.Media.Metadata.exe") };
};
