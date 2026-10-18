import type { MetadataBuildPolicy, MetadataBuildStatus } from "../../../shared/metadataBuildTypes";

export type MetadataScope = MetadataBuildPolicy["includes"][number];
export type MetadataScopeKind = "includes" | "excludes";
export const scopeKey = (scope: MetadataScope) => `${scope.volumeId}:${scope.rootFileReference ?? "root"}`;
export const defaultMetadataPolicy = (status: MetadataBuildStatus): MetadataBuildPolicy => status.policy ?? {
  volumeOrder: status.volumes.map(v => v.volumeId), includes: status.volumes.map(v => ({ volumeId: v.volumeId, rootFileReference: null })), excludes: []
};
export type MetadataSettingsDraft = { order: string[]; selected: string[]; includes: MetadataScope[]; excludes: MetadataScope[] };
export const createMetadataSettingsDraft = (status: MetadataBuildStatus): MetadataSettingsDraft => {
  const policy = defaultMetadataPolicy(status);
  return { order: [...policy.volumeOrder, ...status.volumes.map(v => v.volumeId).filter(id => !policy.volumeOrder.includes(id))],
    selected: [...policy.volumeOrder], includes: policy.includes.map(v => ({ ...v })), excludes: policy.excludes.map(v => ({ ...v })) };
};
export const metadataDraftPolicy = (draft: MetadataSettingsDraft): MetadataBuildPolicy => {
  const volumeOrder = draft.order.filter(id => draft.selected.includes(id));
  return { volumeOrder, includes: volumeOrder.flatMap(volumeId => draft.includes.some(s => s.volumeId === volumeId)
    ? draft.includes.filter(s => s.volumeId === volumeId) : [{ volumeId, rootFileReference: null }]), excludes: draft.excludes.filter(s => volumeOrder.includes(s.volumeId)) };
};
