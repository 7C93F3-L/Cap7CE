import type { VisualCacheType } from "./visualCacheService";

const epochs = new Map<VisualCacheType, number>(), blocked = new Set<VisualCacheType>();
const writes = new Map<Promise<void>, VisualCacheType>();
let clearing: Promise<unknown> = Promise.resolve();
const cancelled = () => Object.assign(Error("Visual cache was cleared."), { code: "ECANCELED" });
export const visualCacheEpoch = (type: VisualCacheType) => blocked.has(type) ? -1 : epochs.get(type) ?? 0;
export const publishVisualCache = (type: VisualCacheType, epoch: number, write: () => Promise<void>) => {
  if (blocked.has(type) || epoch !== visualCacheEpoch(type)) return Promise.reject(cancelled());
  const operation = Promise.resolve().then(write);
  writes.set(operation, type);
  void operation.then(() => writes.delete(operation), () => writes.delete(operation));
  return operation;
};
export const clearVisualCachePublications = (types: readonly VisualCacheType[], clear: () => Promise<void>) => {
  const run = async () => {
    for (const type of types) { blocked.add(type); epochs.set(type, (epochs.get(type) ?? 0) + 1); }
    try {
      await Promise.allSettled([...writes].filter(([, type]) => types.includes(type)).map(([write]) => write));
      await clear();
    } finally { for (const type of types) blocked.delete(type); }
  };
  const operation = clearing.then(run, run);
  clearing = operation.catch(() => undefined);
  return operation;
};
