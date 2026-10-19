const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../core/src/Cap7CE.Core.Host/CatalogSynchronizationService.cs"), "utf8");
const start = source.indexOf("private async Task<CatalogSynchronizationMeasurement> CatchUpAsync");
assert.ok(start >= 0, "Catch-up owner must remain explicit.");
const catchUp = source.slice(start);
const observed = catchUp.indexOf("var observationRevision = await catalog.ReadRevisionAsync(token)");
assert.ok(observed > catchUp.indexOf("for (var pageNumber") && observed < catchUp.indexOf("reader.ReadJournalPageAsync"),
  "Every journal page must capture the global revision before observing source data.");
assert.match(catchUp, /volume.CheckpointUsn,\s+observationRevision,/,
  "Publication must retain the observed checkpoint and global revision fences.");
console.log("Journal resume boundary: per-page global observation precedes source reading and fenced publication.");
