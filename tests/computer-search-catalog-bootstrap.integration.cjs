const assert = require("node:assert/strict");
const { startComputerSearchCatalogSynchronization } = require("../dist-electron/computerSearchCatalogBootstrap.js");
const {
  classifyComputerSearchCatalog, recoverComputerSearchStatus
} = require("../dist-electron/computerSearchRuntime.js");

const volume = (volumeId, state = "disabled", selected = false) => ({
  volumeId, displayName: `${volumeId}:`, fileSystem: "NTFS", selected, state,
  processed: 0, total: null, queryable: false, needsRebuild: state === "needsRebuild"
});

const run = async () => {
  const calls = [];
  let statusReads = 0;
  const controller = {
    async request(operation, body, deadlineMs) {
      calls.push({ operation, body, deadlineMs });
      if (operation === "volume.list") return { volumes: [volume("volume-c"), volume("volume-e")] };
      if (operation === "volume.selection") return { selectedVolumeIds: body.volumeIds };
      if (operation === "catalog.build") return { taskId: "task-1", accepted: true };
      if (operation === "catalog.status") {
        statusReads += 1;
        return statusReads === 1
          ? { volumes: [volume("volume-c", "disabled", true), volume("volume-e", "disabled", true)],
            tasks: [], catalogRevision: 1 }
          : { volumes: [volume("volume-c", "building", true), volume("volume-e", "building", true)],
            tasks: [{ taskId: "task-1", kind: "synchronize", state: "running", errorCode: null }],
            catalogRevision: 2 };
      }
      throw new Error(`unexpected operation: ${operation}`);
    }
  };
  const result = await startComputerSearchCatalogSynchronization(controller);
  assert.equal(result.tasks[0].state, "running");
  assert.deepEqual(calls.map((call) => call.operation), [
    "volume.list", "volume.selection", "catalog.status", "catalog.build", "catalog.status"
  ]);
  assert.deepEqual(calls[1].body.volumeIds, ["volume-c", "volume-e"]);

  const activeCalls = [];
  const activeController = {
    async request(operation, body) {
      activeCalls.push({ operation, body });
      if (operation === "volume.list") return { volumes: [volume("volume-e", "building", true)] };
      if (operation === "volume.selection") return { selectedVolumeIds: body.volumeIds };
      if (operation === "catalog.status") return {
        volumes: [volume("volume-e", "building", true)],
        tasks: [{ taskId: "active", kind: "synchronize", state: "running", errorCode: null }],
        catalogRevision: 3
      };
      throw new Error(`unexpected operation: ${operation}`);
    }
  };
  await startComputerSearchCatalogSynchronization(activeController);
  assert.equal(activeCalls.some((call) => call.operation === "catalog.build"), false,
    "an active synchronization must not be duplicated");

  const catchingUp = classifyComputerSearchCatalog({
    volumes: [{ ...volume("volume-e", "catchingUp", true), queryable: true }],
    tasks: [{ taskId: "sync", kind: "synchronize", state: "running", errorCode: null }],
    catalogRevision: 4
  });
  assert.equal(catchingUp.state, "syncing");
  assert.equal(catchingUp.searchAvailable, true,
    "an existing queryable catalog remains searchable while Journal catch-up runs");
  const building = classifyComputerSearchCatalog({
    volumes: [volume("volume-e", "building", true)],
    tasks: [{ taskId: "build", kind: "synchronize", state: "running", errorCode: null }],
    catalogRevision: 5
  });
  assert.equal(building.state, "building");
  assert.equal(building.searchAvailable, false);
  for (const terminal of ["failed", "cancelled"]) {
    const stoppedTask = { taskId: "stopped", kind: "synchronize", state: terminal, errorCode: terminal === "failed" ? "catalog-concurrency" : null };
    for (const phase of ["building", "catchingUp"]) {
      const stopped = classifyComputerSearchCatalog({
        volumes: [{ ...volume("volume-c", phase, true), queryable: phase === "catchingUp" }, { ...volume("volume-e", "ready", true), queryable: true }],
        tasks: [stoppedTask], catalogRevision: 5
      });
      assert.equal(stopped.state, "needs-rebuild", "a terminal preparation cannot remain indefinitely busy");
      assert.equal(stopped.searchAvailable, true, "a stopped task does not hide unaffected queryable volumes");
    }
    const resumed = classifyComputerSearchCatalog({ volumes: [volume("volume-c", "building", true)],
      tasks: [stoppedTask, { taskId: "new", kind: "synchronize", state: "running", errorCode: null }], catalogRevision: 5 });
    assert.equal(resumed.state, "building", "a new active task supersedes an earlier terminal task");
    const recovered = classifyComputerSearchCatalog({ volumes: [{ ...volume("volume-c", "ready", true), queryable: true }],
      tasks: [stoppedTask], catalogRevision: 5 });
    assert.equal(recovered.state, "ready", "a completed recovery does not retain an old failure state");
  }
  const incompatible = classifyComputerSearchCatalog({ volumes: [volume("volume-c", "building", true)],
    tasks: [{ taskId: "incompatible", kind: "synchronize", state: "failed", errorCode: "reader-repair-required" }], catalogRevision: 5 });
  assert.equal(incompatible.state, "repair-required", "a missing Reader capability requires repair rather than another busy state");
  for (const pendingState of ['building', 'needsRebuild']) {
    const partial = classifyComputerSearchCatalog({
      volumes: [volume('volume-c', pendingState, true), {...volume('volume-e', 'ready', true), queryable:true}],
      tasks: [], catalogRevision:6
    });
    assert.equal(partial.searchAvailable, true, 'one rebuilding volume must not block a ready volume');
    const deselected = classifyComputerSearchCatalog({
      volumes: [volume('volume-c', pendingState, true), {...volume('volume-e', 'ready', false), queryable:true}],
      tasks: [], catalogRevision:6
    });
    assert.equal(deselected.searchAvailable, false, 'deselected volumes do not grant search availability');
  }
  assert.equal(recoverComputerSearchStatus(catchingUp), catchingUp,
    "one transient Core status timeout keeps the last successful queryable status");
  const unavailable = recoverComputerSearchStatus(null);
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.reason, "catalog-unavailable");

  console.log(JSON.stringify({ emptyCatalogBootstrapped: true, interruptedBuildResumed: true,
    activeBuildDeduplicated: true, queryableCatchUpSearchable: true,
    transientCoreStatusUsesLastSuccess: true,
    sourceFilesRead: false, systemChangesPerformed: false }));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
