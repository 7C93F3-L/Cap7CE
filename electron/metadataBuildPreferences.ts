import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { MetadataBuildPolicy } from "../src/shared/metadataBuildTypes";

export interface MetadataBuildPreferences {
  version: 2;
  consent: true;
  intent: "active" | "paused" | "completed";
  policy: MetadataBuildPolicy;
  scopeLabels: Record<string, string>;
}
export interface MetadataBuildPreferenceStore {
  load(): Promise<MetadataBuildPreferences | null>;
  save(value: MetadataBuildPreferences): Promise<void>;
}
const valid = (value: unknown): value is MetadataBuildPreferences => {
  const saved = value as MetadataBuildPreferences | null;
  const policy = saved?.policy;
  return saved?.version === 2 && saved.consent === true && ["active", "paused", "completed"].includes(saved.intent) && !!policy
    && Array.isArray(policy.volumeOrder) && policy.volumeOrder.length > 0 && policy.volumeOrder.length <= 64
    && new Set(policy.volumeOrder).size === policy.volumeOrder.length
    && policy.volumeOrder.every((id) => typeof id === "string" && /^[A-Fa-f0-9]{32}$/.test(id))
    && Array.isArray(policy.includes) && Array.isArray(policy.excludes) && policy.includes.length + policy.excludes.length <= 256
    && [...policy.includes, ...policy.excludes].every((scope) => !!scope && typeof scope.volumeId === "string"
      && /^[A-Fa-f0-9]{32}$/.test(scope.volumeId) && (scope.rootFileReference === null
        || typeof scope.rootFileReference === "string" && /^[A-Fa-f0-9]{16}$/.test(scope.rootFileReference)))
    && !!saved.scopeLabels && typeof saved.scopeLabels === "object" && !Array.isArray(saved.scopeLabels)
    && Object.entries(saved.scopeLabels).length <= 256
    && Object.entries(saved.scopeLabels).every(([key, label]) => /^[A-Fa-f0-9]{32}:(?:[A-Fa-f0-9]{16}|root)$/.test(key)
      && typeof label === "string" && label.length <= 32768 && /^[A-Za-z]:[\\/]/.test(label));
};

// Writes only its own preferences. Reading a saved grant never starts extraction.
export const createMetadataBuildPreferenceStore = (filePath: string): MetadataBuildPreferenceStore => ({
  async load() {
    try { const handle = await open(filePath, "r");
      let text: string;
      try { if ((await handle.stat()).size > 1024 * 1024) return null; text = await handle.readFile("utf8"); }
      finally { await handle.close(); }
      if (Buffer.byteLength(text) > 1024 * 1024) return null;
      const value: unknown = JSON.parse(text); return valid(value) ? value : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
      throw new Error("metadata-build-preferences-unavailable");
    }
  },
  async save(value) {
    if (!valid(value)) throw new Error("metadata-build-invalid-preferences");
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomBytes(12).toString("hex")}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      try { await handle.writeFile(JSON.stringify(value), "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, filePath);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
});
