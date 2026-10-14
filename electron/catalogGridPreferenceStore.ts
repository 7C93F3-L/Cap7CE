import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { catalogGridScopeKey, isCatalogGridMode, isCatalogGridScopePath, readCatalogGridPreferences } from "./catalogGridPreferenceRules";
import type { CatalogGridMode } from "../src/shared/catalogGridPreferenceTypes";

export class CatalogGridPreferenceStore<T = CatalogGridMode> {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly filePath: () => string,
    private readonly codec = { read: readCatalogGridPreferences as (value: unknown) => Record<string, T>, valid: isCatalogGridMode as (value: unknown) => value is T }) {}
  private async read(): Promise<Record<string, T>> {
    try { return this.codec.read(JSON.parse(await fs.readFile(this.filePath(), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  }
  async get() { await this.writes; return this.read(); }
  update(scopePath: unknown, mode: unknown): Promise<Record<string, T>> {
    if (!isCatalogGridScopePath(scopePath) || !this.codec.valid(mode)) return Promise.reject(new Error("catalog-grid-invalid-preference"));
    const operation = this.writes.then(async () => {
      const preferences = await this.read(); preferences[catalogGridScopeKey(scopePath)] = mode;
      const target = this.filePath(), temporary = `${target}.${randomUUID()}.pending`;
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        await fs.rename(temporary, target); return preferences;
      } finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    });
    this.writes = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
