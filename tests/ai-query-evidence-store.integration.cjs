const assert = require("node:assert/strict");
const initSqlJs = require("sql.js");
const {
  aiQueryKeywordLimit,
  aiQueryPromptVersion,
  deleteAiQueryEvidence,
  deleteInvalidAiQueryEvidence,
  ensureAiQueryEvidenceSchema,
  mergeAiQueryEvidence,
  readValidAiQueryEvidence
} = require("../dist-electron/aiQueryEvidenceStore.js");

const identity = {
  imageId: 1,
  sourceRevision: "v1:120:1000",
  modelId: "qwen3.5-0.8b-q8_0.gguf",
  promptVersion: aiQueryPromptVersion
};

const run = async () => {
  const SQL = await initSqlJs();
  let database = new SQL.Database();
  database.run("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE images (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL UNIQUE)");
  database.run("INSERT INTO images (id, file_path) VALUES (1, 'C:/sample.png')");

  ensureAiQueryEvidenceSchema(database);
  ensureAiQueryEvidenceSchema(database);
  mergeAiQueryEvidence(database, [{
    ...identity,
    keywords: ["黑色上衣", "black shirt", "BLACK SHIRT", ...Array.from({ length: 60 }, (_, index) => `词${index}`)],
    updatedAt: "2026-08-24T00:00:00.000Z"
  }]);
  mergeAiQueryEvidence(database, [{ ...identity, keywords: ["牛仔裤", "黑色上衣"] }]);

  let stored = readValidAiQueryEvidence(database, [identity]).get(1);
  assert.equal(stored.keywords.length, aiQueryKeywordLimit);
  assert.deepEqual(stored.keywords.slice(0, 3), ["黑色上衣", "black shirt", "词0"]);
  assert.equal(stored.keywords.includes("BLACK SHIRT"), false);
  assert.equal(stored.keywords.includes("牛仔裤"), false, "the 48-term cap must remain stable when full");
  assert.equal(readValidAiQueryEvidence(database, [{ ...identity, modelId: "other" }]).size, 0);
  assert.equal(readValidAiQueryEvidence(database, [{ ...identity, promptVersion: aiQueryPromptVersion + 1 }]).size, 0);
  assert.equal(readValidAiQueryEvidence(database, [{ ...identity, sourceRevision: "v1:121:1000" }]).size, 0);

  const exported = database.export();
  database.close();
  database = new SQL.Database(exported);
  database.run("PRAGMA foreign_keys = ON");
  stored = readValidAiQueryEvidence(database, [identity]).get(1);
  assert.equal(stored.keywords[0], "黑色上衣");

  deleteInvalidAiQueryEvidence(database, [{ ...identity, sourceRevision: "v1:121:1000" }]);
  assert.equal(database.exec("SELECT COUNT(*) FROM image_ai_query_cache")[0].values[0][0], 0);

  mergeAiQueryEvidence(database, [{ ...identity, keywords: ["白天"] }]);
  deleteAiQueryEvidence(database, [1]);
  assert.equal(database.exec("SELECT COUNT(*) FROM image_ai_query_cache")[0].values[0][0], 0);

  mergeAiQueryEvidence(database, [{ ...identity, keywords: ["做饭"] }]);
  database.run("DELETE FROM images WHERE id = 1");
  assert.equal(database.exec("SELECT COUNT(*) FROM image_ai_query_cache")[0].values[0][0], 0);
  database.close();

  console.log(JSON.stringify({
    schemaInitializationIdempotent: true,
    positiveKeywordMergeCappedAndCaseInsensitive: true,
    identityMismatchInvalidatesCache: true,
    persistenceAndCascadeDeleteVerified: true
  }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
