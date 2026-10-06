const assert = require("node:assert/strict");
const { CoreCatalogChangeProtocol } = require("../dist-electron/core/coreCatalogChangeProtocol.js");
const valid = { sequence: 1, catalogRevision: 10, state: "watching", reason: null, changed: true };
const calls = [];
let value = valid;
const protocol = new CoreCatalogChangeProtocol({
  async request(operation, body, deadline) { calls.push({ operation, body, deadline }); return value; },
  startRequest() { throw new Error("test fallback not expected without a signal"); }, cancel: async () => true
});
const immediate = (response) => new CoreCatalogChangeProtocol({
  request: async () => response,
  startRequest(operation, body, deadline) { calls.push({ operation, body, deadline }); return { requestId: "notice", response: Promise.resolve(response) }; },
  cancel: async () => true
});
(async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(await immediate(valid).wait(0, signal), valid);
  assert.deepEqual(calls[0], { operation: "catalog.awaitChanges", body: { afterSequence: 0, waitMilliseconds: 25000 }, deadline: 30000 });
  assert.equal((await immediate({ ...valid, changed: false }).wait(1, signal)).changed, false);
  assert.equal((await immediate({ ...valid, sequence: 0 }).wait(99, signal)).sequence, 0, "new Host sequence resets cleanly");
  for (const bad of [null, [], {}, { ...valid, sequence: -1 }, { ...valid, sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, catalogRevision: 1.5 }, { ...valid, state: {} }, { ...valid, reason: "private-path" },
    { ...valid, changed: false }, { ...valid, unexpected: true }]) {
    await assert.rejects(immediate(bad).wait(0, signal), /invalid-notice/);
  }
  await assert.rejects(protocol.wait(-1, signal), /invalid-sequence/);
  const precanceled = new AbortController(); precanceled.abort();
  const before = calls.length; await assert.rejects(immediate(valid).wait(0, precanceled.signal), { name: "AbortError" });
  assert.equal(calls.length, before, "pre-cancelled wait does not dispatch");
  const cancellation = new AbortController(); let rejectReply; let cancelTarget;
  const owned = new CoreCatalogChangeProtocol({
    request: async () => { throw new Error("request fallback forbidden"); },
    startRequest: () => ({ requestId: "owned-wait", response: new Promise((resolve, reject) => { rejectReply = reject; }) }),
    cancel: async (target) => { cancelTarget = target; return true; }
  });
  let settled = false;
  const pending = owned.wait(0, cancellation.signal).finally(() => { settled = true; });
  cancellation.abort(); await Promise.resolve();
  assert.equal(cancelTarget, "owned-wait", "abort targets existing authenticated request");
  assert.equal(settled, false, "cancel request alone does not retire a wait before its response");
  rejectReply(new Error("core-cancelled")); await assert.rejects(pending, /core-cancelled/);
  console.log("Catalog notice protocol bounds, reset, and owned cancellation passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
