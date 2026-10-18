const assert = require("node:assert/strict");
const { createCatalogDiagnosticConsumer } = require("../dist-electron/core/coreCatalogDiagnostics.js");
const seen = [], consume = createCatalogDiagnosticConsumer((...event) => seen.push(event));
const line = (name, data) => JSON.stringify({ type: "catalog-diagnostic-v1", name, data }) + "\n";
const event = line("preparation-completed", { activityId: "a".repeat(32), driveLetter: "C", origin: "monitor-startup",
  stage: "directory-paths-and-publish", reason: null, totalMilliseconds: 120, directoryPathMilliseconds: 20, records: 100 });
consume(event.slice(0, 17)); consume(event.slice(17));
assert.equal(seen.length, 1); assert.equal(seen[0][1], "core.catalog.preparation-completed");
assert.equal(seen[0][2].totalMilliseconds, 120); assert.equal(seen[0][2].driveLetter, "C");
consume('raw stderr with a private path\n'); consume('{malformed}\n');
consume(line("preparation-failed", { reason: "C:\\private\\file.png" }));
consume(line("preparation-failed", { message: "secret", driveLetter: "C" }));
consume(line("preparation-completed", { totalMilliseconds: -1 }));
consume(line("preparation-completed", { stage: "unrecognized" }));
consume(line("unknown", {}));
consume('x'.repeat(5000)); consume(event); // oversized line must be discarded through its newline
assert.equal(seen.length, 1, "arbitrary, private and oversized stderr is discarded");
consume(line("preparation-failed", { reason: "preparation-failed" }) + line("monitor-retired", { operation: "discover", elapsedMilliseconds: 5 }));
assert.equal(seen.length, 3); assert.equal(seen[1][0], "warn"); assert.equal(seen[2][2].operation, "discover");
consume(line("monitor-failed", { reason: "reader-entry-names-unavailable" }));
assert.equal(seen.length, 4); assert.equal(seen[3][2].reason, "reader-entry-names-unavailable");
createCatalogDiagnosticConsumer(() => { throw Error("diagnostic destination unavailable"); })(event);
console.log("Bounded Core diagnostics: fragmented lines, measurements, privacy rejection and sink isolation passed.");
