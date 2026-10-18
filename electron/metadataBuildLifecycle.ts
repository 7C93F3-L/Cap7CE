import type { MetadataBuildPreferenceStore, MetadataBuildPreferences } from "./metadataBuildPreferences";
import type { CoreResolvedScope } from "./core/coreProductProtocolTypes";
import type { MetadataBuildPolicy } from "../src/shared/metadataBuildTypes";

// Owns only the durable grant/run intention. Loading or validating never reads
// content; the product lifecycle separately chooses whether to restore a sweep.
export class MetadataBuildLifecycle {
  private saved: MetadataBuildPreferences | null = null;
  private loading?: Promise<void>;
  private writing: Promise<void> = Promise.resolve();
  constructor(private readonly store?: MetadataBuildPreferenceStore) {}
  async load(): Promise<MetadataBuildPreferences | null> {
    await (this.loading ??= (async () => { this.saved = await this.store?.load() ?? null; })());
    return this.saved ? structuredClone(this.saved) : null;
  }
  async grant(policy: MetadataBuildPolicy, scopeLabels: Record<string, string>, configured = false): Promise<void> {
    const selectedLabels = Object.fromEntries([...policy.includes, ...policy.excludes].map(scope => {
      const key = `${scope.volumeId}:${scope.rootFileReference ?? "root"}`; return [key, scopeLabels[key]];
    }).filter(entry => entry[1]));
    await this.write({ version: 2, consent: !configured, intent: configured ? "configured" : "active", policy: structuredClone(policy), scopeLabels: selectedLabels });
  }
  async setIntent(intent: MetadataBuildPreferences["intent"]): Promise<void> {
    if (this.saved?.consent) await this.write({ ...this.saved, intent });
  }
  async flush(): Promise<void> { await this.writing; }
  async validate(volumes: readonly { volumeId: string; queryable?: boolean }[], resolveScope?: (path: string) => Promise<CoreResolvedScope>): Promise<void> {
    const saved = await this.load(); if (!saved) return;
    const selected = new Set(volumes.map(volume => volume.volumeId));
    if (saved.policy.volumeOrder.some(volume => !selected.has(volume))) throw new Error("metadata-build-volume-unavailable");
    if (volumes.some(volume => saved.policy.volumeOrder.includes(volume.volumeId) && volume.queryable === false)) throw new Error("metadata-build-volume-unavailable");
    for (const scope of [...saved.policy.includes, ...saved.policy.excludes]) {
      if (!selected.has(scope.volumeId)) throw new Error("metadata-build-volume-unavailable");
      if (scope.rootFileReference === null) continue;
      const label = saved.scopeLabels[`${scope.volumeId}:${scope.rootFileReference}`];
      if (!label || !resolveScope) throw new Error("metadata-build-scope-unavailable");
      const resolved = await resolveScope(label);
      if (!resolved.resolved || !resolved.queryable || resolved.volumeId !== scope.volumeId || resolved.rootFileReference !== scope.rootFileReference)
        throw new Error("metadata-build-scope-changed");
    }
  }
  private async write(value: MetadataBuildPreferences): Promise<void> {
    const snapshot = structuredClone(value);
    const pending = this.writing.catch(() => undefined).then(async () => { await this.store?.save(snapshot); this.saved = snapshot; });
    this.writing = pending; await pending;
  }
}
