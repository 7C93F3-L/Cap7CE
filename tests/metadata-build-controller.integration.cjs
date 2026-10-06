const assert = require("node:assert/strict");
const { MetadataBuildController } = require("../dist-electron/metadataExtraction/metadataBuildController.js");
const { MetadataBuildEstimate, metadataBuildDelay } = require("../dist-electron/metadataExtraction/metadataBuildProgress.js");
const volumes = ["F".repeat(32), "C".repeat(32)];
const specifications = [{ kind: 0, extractorVersion: 1, extensions: [".png"] }, { kind: 1, extractorVersion: 2, extensions: [".mp4"] }];
const policy = { volumeOrder: volumes, includes: volumes.map((volumeId) => ({ volumeId, rootFileReference: null })), excludes: [] };
const until = async (predicate) => {
  for (let i = 0; i < 1000; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 2)); }
  throw new Error("Test lifecycle did not advance.");
};

function fixture(perKind = 4) {
  const rows = volumes.flatMap((volumeId) => specifications.flatMap(({ kind, extractorVersion }) =>
    Array.from({ length: perKind }, (_, index) => ({ identity: { volumeId, fileReference: (index + kind * 100 + 1).toString(16).padStart(16, "0") },
      kind, extractorVersion, done: false, queued: false, leaseId: null }))));
  const control = { offline: false, blockedRead: false, blockedConfiguration: false, busyOnce: false, emptyOnce: false, sourceChangedOnce: false,
    configurations: 0, reads: 0, publications: 0, closes: 0, discoveries: 0, order: [], workerErrors: [], results: [] };
  let active = false, sequence = 0;
  const protocol = {
    async configure(_policy, allowed, signal) {
      assert.equal(allowed, true); control.configurations++;
      if (control.blockedConfiguration) await metadataBuildDelay(10000, signal);
      active = true; return { state: "active", ledger: null };
    },
    async pause() { active = false; rows.forEach((row) => { row.leaseId = null; }); return { state: "paused", ledger: null }; },
    async status(kind, version, volumeId) {
      const selected = rows.filter((row) => row.kind === kind && row.extractorVersion === version && row.identity.volumeId === volumeId && row.queued);
      return { state: active ? "active" : "paused", ledger: { policyEpoch: 1, pendingJobs: selected.filter((row) => !row.done && !row.leaseId).length,
        leasedJobs: selected.filter((row) => row.leaseId).length, completedJobs: selected.filter((row) => row.done).length,
        nextLeaseExpiryUnixMilliseconds: null, unavailableVolumeIds: control.offline ? [volumeId] : [] } };
    },
    async discover(kind, version, _extensions, after, volumeId) {
      control.discoveries++;
      const selected = rows.filter((row) => row.kind === kind && row.extractorVersion === version && row.identity.volumeId === volumeId && !row.done);
      const start = after ? Number(after.fileReference) : 0;
      const page = selected.slice(start, start + 2); page.forEach((row) => { row.queued = true; });
      return { jobs: page, next: start + 2 < selected.length ? { volumeId, fileReference: String(start + 2), specificationHash: "A".repeat(64) } : null };
    },
    async claim(selection) {
      if (control.emptyOnce) { control.emptyOnce = false; return { state: 1, ticket: null }; }
      const row = rows.find((row) => row.queued && !row.done && !row.leaseId && row.identity.volumeId === selection.volumeId &&
        selection.extractors.some((reader) => reader.kind === row.kind && reader.extractorVersion === row.extractorVersion));
      if (!row) return { state: 1, ticket: null };
      row.leaseId = (++sequence).toString(16).padStart(32, "0");
      control.order.push(row.identity.volumeId);
      return { state: 0, ticket: { fullPath: row.kind === 0 ? "C:\\generated.png" : "C:\\generated.mp4",
        lease: { leaseId: row.leaseId, job: row } } };
    },
    task(ticket) { return { kind: ticket.lease.job.kind === 0 ? "image-dimensions" : "video", filePath: ticket.fullPath }; },
    async complete(leaseId, result) {
      const row = rows.find((row) => row.leaseId === leaseId);
      if (!row || !active) return 1;
      row.leaseId = null;
      if (control.sourceChangedOnce) { control.sourceChangedOnce = false; return 3; }
      row.done = true; control.publications++; control.results.push(result); return 0;
    }
  };
  const workerFactory = () => ({ async extract(task, signal) {
    signal.throwIfAborted();
    if (control.busyOnce) { control.busyOnce = false; throw new Error("metadata-worker-busy"); }
    control.reads++;
    const workerError = control.workerErrors.shift();
    if (workerError) throw new Error(workerError);
    await metadataBuildDelay(control.blockedRead ? 10000 : 2, signal);
    return task.kind === "image-dimensions" ? { state: "indexed", width: 64, height: 48 }
      : { state: "indexed", width: 1920, height: 1080, durationMilliseconds: 1000 };
  }, close() { control.closes++; } });
  return { protocol, workerFactory, control, rows };
}
const controller = (test, onProgress) => new MetadataBuildController(test.protocol,
  { specifications, workerFactory: test.workerFactory, onProgress, yieldMs: 1, waitMs: 2 });

(async () => {
  const ordered = fixture(); const progress = [];
  ordered.control.emptyOnce = true; ordered.control.busyOnce = true; ordered.control.sourceChangedOnce = true;
  const build = controller(ordered, (value) => progress.push(value));
  assert.throws(() => build.start(policy, false), /confirmation-required/);
  assert.equal(ordered.control.configurations, 0);
  build.start(policy, true);
  assert.throws(() => build.start(policy, true), /busy/);
  const completed = await build.waitForIdle();
  assert.equal(completed.phase, "completed"); assert.equal(completed.processed, 16); assert.equal(completed.total, 16);
  assert.equal((await build.pause()).phase, "completed", "a late pause cannot turn completed work into paused work");
  assert.equal(completed.progressFraction, 1); assert.equal(ordered.control.reads, 17);
  assert.equal(ordered.control.closes, 1);
  assert.deepEqual([...new Set(ordered.control.order)], volumes, "scope processing follows drive order");
  assert.ok(progress.some((value) => value.phase === "waiting"), "an empty claim with pending jobs does not finish the build");
  assert.ok(progress.some((value) => value.phase === "discovering" && value.total === null), "unknown totals remain unknown");
  assert.ok(progress.some((value) => value.remainingSeconds > 0), "ETA appears after both kinds have usable samples");
  build.start(policy, true); await build.waitForIdle();
  assert.equal(ordered.control.reads, 17, "unchanged sources do not invoke the content reader again");

  const offline = fixture(1); offline.control.offline = true;
  const waiting = controller(offline); waiting.start(policy, true);
  await until(() => waiting.snapshot().phase === "waiting");
  assert.equal(offline.control.reads, 0); assert.equal(waiting.snapshot().remainingSeconds, null);
  offline.control.offline = false;
  assert.equal((await waiting.waitForIdle()).phase, "completed");

  const interrupted = fixture(1); interrupted.control.blockedRead = true;
  const paused = controller(interrupted); paused.start(policy, true);
  await until(() => interrupted.control.reads === 1);
  assert.equal((await paused.pause()).phase, "paused");
  assert.equal(interrupted.control.publications, 0, "cancelled content cannot become a failed or indexed fact");
  interrupted.control.blockedRead = false; paused.start(policy, true);
  assert.equal((await paused.waitForIdle()).processed, 4);
  assert.equal(interrupted.control.publications, 4);

  const partial = fixture(1); let resumed, pausePromise;
  resumed = controller(partial, (value) => {
    if (value.phase === "extracting" && value.processed === 1 && !pausePromise) pausePromise = resumed.pause();
  });
  resumed.start(policy, true); await until(() => pausePromise); await pausePromise;
  assert.equal(resumed.snapshot().processed, 1);
  resumed.start(policy, true); const final = await resumed.waitForIdle();
  assert.equal(final.processed, 4); assert.equal(final.total, 4); assert.equal(partial.control.reads, 4);

  const preparing = fixture(1); preparing.control.blockedConfiguration = true;
  const beforeReads = controller(preparing); beforeReads.start(policy, true);
  assert.equal((await beforeReads.pause()).phase, "paused"); assert.equal(preparing.control.reads, 0);

  const isolated = fixture(2);
  isolated.control.workerErrors = ["metadata-worker-exited", null, "metadata-worker-timeout", null, "metadata-worker-exited"];
  const continuing = controller(isolated); continuing.start(policy, true);
  const recovered = await continuing.waitForIdle();
  assert.equal(recovered.phase, "completed"); assert.equal(recovered.processed, 8); assert.equal(recovered.failed, 3);
  assert.deepEqual(isolated.control.results.filter(result => result.state === "failed").map(result => result.errorCode),
    ["metadata-worker-exited", "metadata-worker-timeout", "metadata-worker-exited"]);
  continuing.start(policy, true); await continuing.waitForIdle();
  assert.equal(isolated.control.reads, 8, "source-version failures are cached and do not restart a crashing decoder each sweep");

  const broken = fixture(2);
  broken.control.workerErrors = Array(8).fill("metadata-worker-exited");
  const bounded = controller(broken); bounded.start(policy, true);
  assert.equal((await bounded.waitForIdle()).phase, "failed");
  assert.equal(broken.control.reads, 3); assert.equal(broken.control.publications, 2);
  assert.equal(broken.control.closes, 1, "the helper is closed when repeated crashes stop the sweep");
  broken.control.workerErrors = []; bounded.start(policy, true);
  assert.equal((await bounded.waitForIdle()).processed, 6, "the third source remains retryable after the environment recovers");

  const invalid = fixture(1); invalid.control.workerErrors = ["metadata-worker-invalid-response"];
  const rejected = controller(invalid); rejected.start(policy, true);
  assert.equal((await rejected.waitForIdle()).phase, "failed");
  assert.equal(invalid.control.publications, 0, "protocol/startup failures must not be cached as source failures");

  const changed = fixture(2);
  const changedRow = changed.rows.find(row => row.identity.volumeId === volumes[1] && row.kind === 0);
  let changeCalls = 0;
  changed.protocol.consumeChanges = async () => {
    changeCalls++; changedRow.queued = true;
    return { jobsDiscovered: 1, acknowledged: true, hasMore: changeCalls < 2 };
  };
  let workerStarts = 0;
  const makeChangedWorker = changed.workerFactory;
  changed.workerFactory = () => { workerStarts++; return makeChangedWorker(); };
  const changedBuild = controller(changed);
  assert.throws(() => changedBuild.startChanges(policy, false), /confirmation-required/);
  changedBuild.startChanges(policy, true);
  const changedProgress = await changedBuild.waitForIdle();
  assert.equal(changedProgress.phase, "completed");
  assert.equal(changedProgress.discovered, 1, "overlapping hints do not inflate the queue denominator");
  assert.equal(changedProgress.total, 1); assert.equal(changedProgress.processed, 1);
  assert.equal(changed.control.discoveries, 0, "wake-drain cannot run whole-Catalog discovery");
  assert.equal(changed.control.reads, 1, "only the changed queued identity is read");
  changed.protocol.consumeChanges = async () => { changeCalls++; return { jobsDiscovered: 0, acknowledged: false, hasMore: false }; };
  changedBuild.startChanges(policy, true); await changedBuild.waitForIdle();
  assert.equal(workerStarts, 1, "empty wake must not create another extraction helper");
  const callsWhenIdle = changeCalls;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(changeCalls, callsWhenIdle, "completed wake-drain does not poll empty changes");

  const changedOffline = fixture(1);
  changedOffline.rows.filter(row => row.kind === 0).forEach(row => { row.queued = true; });
  const originalStatus = changedOffline.protocol.status;
  changedOffline.protocol.status = async (...args) => {
    const status = await originalStatus(...args);
    if (args[2] === volumes[0]) status.ledger.unavailableVolumeIds = [volumes[0]];
    return status;
  };
  changedOffline.protocol.consumeChanges = async () => ({ jobsDiscovered: 0, acknowledged: false, hasMore: false });
  const changedOfflineBuild = controller(changedOffline);
  changedOfflineBuild.startChanges(policy, true);
  assert.equal((await changedOfflineBuild.waitForIdle()).processed, 1, "offline first drive does not block ready-drive extraction");
  assert.equal(changedOffline.rows.find(row => row.identity.volumeId === volumes[0] && row.kind === 0).done, false,
    "offline work remains pending for a future wake");

  const boundedChanges = fixture(1); let boundedCalls = 0;
  boundedChanges.protocol.consumeChanges = async () => {
    boundedCalls++; boundedChanges.rows[0].queued = true;
    return { jobsDiscovered: boundedCalls === 1 ? 1 : 0, acknowledged: false, hasMore: true };
  };
  const boundedBuild = controller(boundedChanges);
  boundedBuild.startChanges(policy, true);
  assert.equal((await boundedBuild.waitForIdle()).processed, 1, "long hint stream yields a turn to extraction");
  assert.equal(boundedCalls, 64); assert.equal(boundedBuild.hasPendingChanges(), true);

  const cancelChanges = fixture(1); let consuming = false;
  cancelChanges.protocol.consumeChanges = async (_specifications, signal) => {
    consuming = true; await metadataBuildDelay(10000, signal);
    return { jobsDiscovered: 0, acknowledged: false, hasMore: false };
  };
  const cancelledChangesBuild = controller(cancelChanges);
  cancelledChangesBuild.startChanges(policy, true); await until(() => consuming);
  assert.equal((await cancelledChangesBuild.pause()).phase, "paused");
  assert.equal(cancelChanges.control.reads, 0, "cancelled discovery never starts content extraction");

  const estimate = new MetadataBuildEstimate();
  for (let i = 0; i < 8; i++) estimate.add(0, 100);
  assert.equal(estimate.remaining(new Map([[0, 10], [1, 2]])), null, "unknown video costs cannot be inferred from image samples");
  estimate.add(1, 500); estimate.add(1, 500);
  assert.equal(estimate.remaining(new Map([[0, 10], [1, 2]])), 2);
  console.log("Metadata build scheduling, progress and pause/resume tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
