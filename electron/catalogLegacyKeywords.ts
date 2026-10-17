import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import { getImageDatabasePath } from "./sqliteImageIndex";
import { parseKeywordText } from "./keywordRules";

export interface LegacyKeywordEntry { path: string; keywords: string[]; createdFileTimeMilliseconds: string; }
// Read bounded pages, closing the read-only handle before awaiting Core. Never alter the old index.
export async function readLegacyKeywordPage(after: string, databasePath = getImageDatabasePath()): Promise<{ entries: LegacyKeywordEntry[]; after: string | null }> {
  try { await fs.access(databasePath); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [], after: null }; throw error; }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='file_user_metadata'").get()) return { entries: [], after: null };
    const rows = database.prepare(`SELECT u.file_path, u.keywords, f.created_at FROM file_user_metadata u
      JOIN files f ON f.file_path=u.file_path WHERE u.file_path > ? COLLATE NOCASE AND u.keywords<>''
      ORDER BY u.file_path COLLATE NOCASE LIMIT 64`).all(after);
    return { entries: rows.flatMap(row => {
      const created = Date.parse(String(row.created_at));
      return Number.isFinite(created) ? [{ path: String(row.file_path), keywords: parseKeywordText(String(row.keywords)),
        createdFileTimeMilliseconds: String(Math.trunc(created + 11644473600000)) }] : [];
    }), after: rows.length === 64 ? String(rows[rows.length - 1].file_path) : null };
  } finally { database.close(); }
}
