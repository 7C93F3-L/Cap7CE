import { app } from "electron";
import { maximumCacheImageBytes } from "./core/visualCacheFrames";
import { CoreVisualCacheClient } from "./core/coreVisualCacheClient";
import { createVisualCachePaths } from "./core/visualCachePaths";
import type { VisualCacheType, VisualCacheEntry, VisualCacheSourceMetadata, VisualCacheStats, VisualCacheImage, VisualImageMimeType } from "../src/shared/visualCacheTypes";
export { detectVisualImageMimeType } from "./core/visualCacheImage";
export type * from "../src/shared/visualCacheTypes";

let client: CoreVisualCacheClient | undefined, clientRoot: string | undefined;
const owner = () => {
  const root = app.getPath("userData");
  if (root !== clientRoot) { client?.close(); clientRoot = root; client = new CoreVisualCacheClient(root); }
  return client!;
};
export const closeVisualCacheOwner = () => { client?.close(); client = undefined; clientRoot = undefined; };
app.once("will-quit", closeVisualCacheOwner);
process.once("exit", closeVisualCacheOwner);
const request = <T>(method: string, args: unknown[] = []) => owner().request(method, args) as Promise<T>;
const locations = () => createVisualCachePaths(app.getPath("userData"));
export const getVisualCacheDescriptor = (type: VisualCacheType) => locations().getVisualCacheDescriptor(type);
export const getVisualCacheDirectory = (type: VisualCacheType) => locations().getVisualCacheDirectory(type);
export const getVisualCacheMetadataDirectory = (type: VisualCacheType) => locations().getVisualCacheMetadataDirectory(type);
export const getVisualCacheDirectories = () => locations().getVisualCacheDirectories();
export const isCap7CECachePath = (filePath: string) => locations().isCap7CECachePath(filePath);
export const initializeVisualCacheDirectories = () => request<void>("initialize");
export const getVisualCacheStats = () => request<VisualCacheStats>("stats");
export const getSkimVisualCacheStats = () => request<VisualCacheStats>("skimStats");
export const clearVisualCaches = () => request<VisualCacheStats>("clear");
export const clearThumbnailVisualCaches = () => request<VisualCacheStats>("clearThumbnails");
export const clearSkimVisualCaches = () => request<VisualCacheStats>("clearSkim");
export const listThumbnailCacheFiles = () => request<string[]>("inventory");
export const createVisualCacheEntry = (sourcePath: string, type: VisualCacheType) => request<VisualCacheEntry>("create", [sourcePath, type]);
export const createVisualCacheEntryFromSourceMetadata = (sourcePath: string, type: VisualCacheType, metadata: VisualCacheSourceMetadata) =>
  request<VisualCacheEntry>("createFromMetadata", [sourcePath, type, metadata]);
export const isVisualCacheEntryValid = (entry: VisualCacheEntry) => request<boolean>("valid", [entry]);
export const writeVisualCacheEntry = (entry: VisualCacheEntry, image: Buffer, mimeType: VisualImageMimeType) => image.length > maximumCacheImageBytes
  ? Promise.reject(new Error("core-cache-image-too-large")) : request<void>("write", [entry, image.toString("base64"), mimeType]);
export const readVisualCacheImage = async (imagePath: string): Promise<VisualCacheImage> => {
  const image = await request<{ base64: string; mimeType: VisualImageMimeType }>("read", [imagePath]);
  return { buffer: Buffer.from(image.base64, "base64"), mimeType: image.mimeType };
};
export const deleteVisualCacheImage = (imagePath: string, type: VisualCacheType) => request<void>("deleteImage", [imagePath, type]);
export const deleteVisualCachesForImagesByType = (sourcePaths: string[], type: VisualCacheType) => request<number>("deleteSourcesByType", [sourcePaths, type]);
export const deleteVisualCachesForImages = (sourcePaths: string[]) => request<void>("deleteSources", [sourcePaths]);
export const deleteVisualCachesForDirectory = (directoryPath: string) => request<void>("deleteDirectory", [directoryPath]);
