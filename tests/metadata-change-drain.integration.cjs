const assert = require("node:assert/strict");
const { MetadataChangeDrain } = require("../dist-electron/metadataExtraction/metadataChangeDrain.js");
const turn = () => new Promise(resolve => setImmediate(resolve));
const policy = { volumeOrder: ["A"], includes: [], excludes: [] };
(async () => {
  let releaseSweep; let sweep = new Promise(resolve => { releaseSweep = resolve; });
  let releaseRound, rounds = 0, active = 0, maximum = 0, more = false, allowed = true, failures = 0;
  const controller = {
    waitForIdle: () => sweep,
    startChanges(value, consent) {
      assert.equal(value, policy); assert.equal(consent, true); rounds++; active++; maximum = Math.max(maximum, active);
      sweep = new Promise(resolve => { releaseRound = () => { active--; resolve({ phase: "completed" }); }; });
    },
    hasPendingChanges: () => more
  };
  const drain = new MetadataChangeDrain(controller, () => allowed ? policy : null, () => { failures++; });
  for (let i = 0; i < 50; i++) drain.notify();
  await turn(); assert.equal(rounds, 0, "notifications cannot overlap initial sweep");
  releaseSweep({ phase: "completed" }); await turn(); assert.equal(rounds, 1);
  for (let i = 0; i < 50; i++) drain.notify();
  releaseRound(); await turn(); assert.equal(rounds, 2, "events during extraction coalesce into one further drain");
  more = true; releaseRound(); await turn(); assert.equal(rounds, 3, "bounded pages with remaining hints continue");
  more = false; releaseRound(); await drain.waitForIdle(); assert.equal(rounds, 3);
  await turn(); assert.equal(rounds, 3, "idle does not schedule another query");
  sweep = new Promise(resolve => { releaseSweep = resolve; }); drain.notify(); await turn();
  drain.reset(); allowed = false; releaseSweep({ phase: "completed" }); await drain.waitForIdle();
  assert.equal(rounds, 3, "pause invalidates notifications waiting for a sweep");
  allowed = true; sweep = Promise.resolve({ phase: "completed" });
  drain.notify(); await turn(); drain.reset(); releaseRound(); await drain.waitForIdle();
  assert.equal(rounds, 4); assert.equal(maximum, 1);
  const failure = new MetadataChangeDrain({ waitForIdle: async () => ({ phase: "completed" }),
    startChanges() { throw Error("busy"); }, hasPendingChanges: () => false }, () => policy, () => { failures++; });
  failure.notify(); await failure.waitForIdle(); assert.equal(failures, 1, "control failure has an owned handler");
  console.log("Metadata event coalescing, bounded continuation, idle silence and pause fences passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
