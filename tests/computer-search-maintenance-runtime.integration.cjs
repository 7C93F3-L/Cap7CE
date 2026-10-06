const assert = require("node:assert/strict");
const hostModule = require("../dist-electron/core/coreHostController.js");
const metadataModule = require("../dist-electron/metadataExtraction/metadataBuildRuntime.js");
const savedHost = hostModule.CoreHostController, savedMetadata = metadataModule.createMetadataBuildRuntime;
const turn = () => new Promise(resolve => setImmediate(resolve));
const volume = { volumeId: "A".repeat(32), displayName: "X:", fileSystem: "NTFS", selected: true, state: "ready", queryable: true };
const waits = [], order = []; let activeWaits = 0, maximumWaits = 0, restores = 0, notifications = 0;
let discoveries = 0;
let metadataRelease;
class FixtureHost {
  state = "stopped";
  snapshot() { return { state: this.state, processId: this.state === "ready" ? 123 : undefined }; }
  async start() { this.state = "ready"; return { state: "ready", processId: 123, restartCount: 0 }; }
  supports(name) { return name === "catalog.awaitChanges"; }
  async stop() { this.state = "stopped"; assert.equal(activeWaits, 0); order.push("host-stop"); }
  async request(operation) {
    if (operation === "catalog.status") return { volumes: [volume], tasks: [], catalogRevision: 1 };
    if (operation === "volume.list") { discoveries++; return { volumes: [volume] }; }
    if (operation === "volume.selection" || operation === "catalog.build") return {};
    throw Error(`unexpected-operation-${operation}`);
  }
  startRequest(operation, body) {
    assert.equal(operation, "catalog.awaitChanges"); activeWaits++; maximumWaits = Math.max(maximumWaits, activeWaits);
    let resolve, reject; const response = new Promise((yes, no) => { resolve = yes; reject = no; }).finally(() => {
      activeWaits--; order.push("wait-retired");
    });
    const requestId = `wait-${waits.length}`; waits.push({ requestId, body, resolve, reject, cancelled: false });
    return { requestId, response };
  }
  async cancelRequest(requestId) { waits.find(wait => wait.requestId === requestId).cancelled = true; return true; }
}
hostModule.CoreHostController = FixtureHost;
metadataModule.createMetadataBuildRuntime = () => ({
  async restore() { restores++; },
  notifyCatalogChange() { notifications++; return new Promise(resolve => { metadataRelease = resolve; }); },
  async shutdown() { assert.equal(activeWaits, 0); order.push("metadata-stop"); metadataRelease?.(); }
});
const { createComputerSearchRuntime } = require("../dist-electron/computerSearchRuntime.js");
const notice = (sequence, revision, changed = true, state = "watching") => ({ sequence, catalogRevision: revision, changed, state, reason: null });
(async () => {
  const runtime = createComputerSearchRuntime({ packaged: false, productVersion: "fixture" });
  try {
    await runtime.refreshStorage(); assert.equal(discoveries, 0, "OS events cannot start an unused Host");
    await runtime.status(); await turn(); assert.equal(waits.length, 1); assert.ok(restores >= 1);
    const beforeRefresh = discoveries;
    await runtime.refreshStorage(); assert.equal(discoveries, beforeRefresh + 1, "OS event reuses discovery and synchronization");
    assert.equal(waits.length, 1, "storage refresh preserves the notification owner");
    waits[0].resolve(notice(1, 1)); await turn(); assert.equal(notifications, 1); assert.equal(waits.length, 2);
    assert.equal(waits[1].body.afterSequence, 1, "long metadata work cannot block next notification wait");
    waits[1].resolve(notice(1, 1, false)); await turn(); assert.equal(notifications, 1);
    waits[2].resolve(notice(2, 1, true, "starting")); await turn(); assert.equal(notifications, 1, "state-only notice does not extract");
    waits[3].resolve(notice(3, 2)); await turn(); assert.equal(notifications, 2);
    await runtime.status(); assert.equal(waits.length, 5, "ordinary status preserves the current waiter");
    let stopped = false; const stopping = runtime.stop().then(() => { stopped = true; }); await turn();
    assert.equal(waits[4].cancelled, true); assert.equal(stopped, false); assert.ok(!order.includes("metadata-stop"));
    const count = waits.length; await runtime.status(); assert.equal(waits.length, count, "status during stop cannot resurrect waiting");
    await runtime.refreshStorage(); assert.equal(discoveries, beforeRefresh + 1, "OS event during stop cannot resurrect synchronization");
    waits[4].reject(Error("cancelled")); await stopping;
    assert.deepEqual(order.slice(-3), ["wait-retired", "metadata-stop", "host-stop"]);
    assert.equal(maximumWaits, 1); assert.equal(activeWaits, 0);
    console.log("Product Catalog notifications update granted maintenance without blocking waits; shutdown retires owners in order.");
  } finally { hostModule.CoreHostController = savedHost; metadataModule.createMetadataBuildRuntime = savedMetadata; }
})().catch(error => { console.error(error); process.exitCode = 1; });
