import type { Database } from "sql.js";
import { formatKeywordText, parseKeywordText } from "./keywordRules";

export const aiQueryPromptVersion = 3;
export const aiQueryKeywordLimit = 48;
export const aiQueryEvidencePersistenceEnabled = false;

export interface AiQueryEvidenceIdentity {
  imageId: number;
  sourceRevision: string;
  modelId: string;
  promptVersion: number;
}

export interface AiQueryEvidenceRecord extends AiQueryEvidenceIdentity {
  keywords: string[];
  updatedAt: string;
}

export interface AiQueryEvidenceMerge extends AiQueryEvidenceIdentity {
  keywords: string[];
  updatedAt?: string;
}

const normalizeKeywords = (keywords: string[]) => {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const value = String(keyword ?? "").trim().replace(/\s+/g, " ");
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
    if (normalized.length >= aiQueryKeywordLimit) break;
  }
  return normalized;
};

export const ensureAiQueryEvidenceSchema = (database: Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS image_ai_query_cache (
      image_id INTEGER PRIMARY KEY,
      keywords TEXT NOT NULL DEFAULT '',
      source_revision TEXT NOT NULL,
      model_id TEXT NOT NULL,
      prompt_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_ai_query_cache_keywords
      ON image_ai_query_cache (keywords);
  `);
};

const readStoredRecord = (database: Database, imageId: number): AiQueryEvidenceRecord | null => {
  const row = database.exec(`
    SELECT keywords, source_revision, model_id, prompt_version, updated_at
    FROM image_ai_query_cache
    WHERE image_id = :image_id
    LIMIT 1
  `, { ":image_id": imageId })[0]?.values[0];
  if (!row) return null;
  return {
    imageId,
    keywords: parseKeywordText(String(row[0] ?? "")),
    sourceRevision: String(row[1] ?? ""),
    modelId: String(row[2] ?? ""),
    promptVersion: Number(row[3] ?? 0),
    updatedAt: String(row[4] ?? "")
  };
};

const identitiesMatch = (left: AiQueryEvidenceIdentity, right: AiQueryEvidenceIdentity) => (
  left.imageId === right.imageId
  && left.sourceRevision === right.sourceRevision
  && left.modelId === right.modelId
  && left.promptVersion === right.promptVersion
);

export const readValidAiQueryEvidence = (
  database: Database,
  identities: AiQueryEvidenceIdentity[]
): Map<number, AiQueryEvidenceRecord> => {
  const records = new Map<number, AiQueryEvidenceRecord>();
  for (const identity of identities) {
    const stored = readStoredRecord(database, identity.imageId);
    if (stored && identitiesMatch(stored, identity)) records.set(identity.imageId, stored);
  }
  return records;
};

export const mergeAiQueryEvidence = (database: Database, entries: AiQueryEvidenceMerge[]) => {
  if (entries.length === 0) return;
  database.run("BEGIN TRANSACTION");
  try {
    for (const entry of entries) {
      const existing = readStoredRecord(database, entry.imageId);
      const existingKeywords = existing && identitiesMatch(existing, entry) ? existing.keywords : [];
      const keywords = normalizeKeywords([...existingKeywords, ...entry.keywords]);
      database.run(`
        INSERT INTO image_ai_query_cache (
          image_id, keywords, source_revision, model_id, prompt_version, updated_at
        ) VALUES (
          :image_id, :keywords, :source_revision, :model_id, :prompt_version, :updated_at
        )
        ON CONFLICT(image_id) DO UPDATE SET
          keywords = excluded.keywords,
          source_revision = excluded.source_revision,
          model_id = excluded.model_id,
          prompt_version = excluded.prompt_version,
          updated_at = excluded.updated_at
      `, {
        ":image_id": entry.imageId,
        ":keywords": formatKeywordText(keywords),
        ":source_revision": entry.sourceRevision,
        ":model_id": entry.modelId,
        ":prompt_version": entry.promptVersion,
        ":updated_at": entry.updatedAt ?? new Date().toISOString()
      });
    }
    database.run("COMMIT");
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
};

export const deleteInvalidAiQueryEvidence = (
  database: Database,
  identities: AiQueryEvidenceIdentity[]
) => {
  for (const identity of identities) {
    database.run(`
      DELETE FROM image_ai_query_cache
      WHERE image_id = :image_id
        AND (
          source_revision <> :source_revision
          OR model_id <> :model_id
          OR prompt_version <> :prompt_version
        )
    `, {
      ":image_id": identity.imageId,
      ":source_revision": identity.sourceRevision,
      ":model_id": identity.modelId,
      ":prompt_version": identity.promptVersion
    });
  }
};

export const deleteAiQueryEvidence = (database: Database, imageIds: number[]) => {
  if (imageIds.length === 0) return;
  database.run("BEGIN TRANSACTION");
  try {
    for (const imageId of imageIds) {
      database.run("DELETE FROM image_ai_query_cache WHERE image_id = :image_id", { ":image_id": imageId });
    }
    database.run("COMMIT");
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      // Preserve the original delete error.
    }
    throw error;
  }
};
