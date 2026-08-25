const assert = require("node:assert/strict");
const { app } = require("electron");

const timestamp = new Date("2026-08-09T00:00:00.000Z").toISOString();
const directory = {
  id: "directory-one",
  name: "Directory One",
  path: "C:\\fixtures\\directory-one",
  indexedCount: 0,
  createdAt: timestamp,
  updatedAt: timestamp
};

const resultFor = (target, fileName = "sample.txt", status = "ready") => ({
  scannedAt: timestamp,
  directories: [{
    directory_id: target.id,
    directory_path: target.path,
    status,
    file_count: status === "ready" ? 1 : 0,
    image_count: 0,
    skipped_files: 0,
    skipped_directories: status === "error" ? 1 : 0
  }],
  files: status === "ready" ? [{
    directory_id: target.id,
    directory_path: target.path,
    file_path: `${target.path}\\${fileName}`,
    file_name: fileName,
    extension: ".txt",
    file_size: 1,
    created_at: timestamp,
    modified_at: timestamp,
    modified_ms: Date.now()
  }] : [],
  images: [],
  summaries: [{
    id: target.id,
    indexedCount: 0,
    lastScannedAt: timestamp,
    scanStatus: status
  }]
});

app.whenReady().then(async () => {
  const { SearchScanSnapshotService, SEARCH_SCAN_SNAPSHOT_TTL_MS } = require("../dist-electron/searchScanSnapshotService.js");

  let now = 1000;
  let scanCalls = 0;
  const service = new SearchScanSnapshotService(async ([target]) => {
    scanCalls += 1;
    return resultFor(target, `sample-${scanCalls}.txt`);
  }, () => now);

  const first = await service.get([directory]);
  assert.equal(scanCalls, 1);
  assert.equal(first.files[0].file_name, "sample-1.txt");
  now += SEARCH_SCAN_SNAPSHOT_TTL_MS - 1;
  const cached = await service.get([directory]);
  assert.equal(scanCalls, 1);
  assert.equal(cached.files[0].file_name, "sample-1.txt");
  now += 1;
  const expired = await service.get([directory]);
  assert.equal(scanCalls, 2);
  assert.equal(expired.files[0].file_name, "sample-2.txt");

  let releaseSharedScan;
  let sharedCalls = 0;
  const sharedService = new SearchScanSnapshotService(async ([target]) => {
    sharedCalls += 1;
    await new Promise((resolve) => { releaseSharedScan = resolve; });
    return resultFor(target);
  });
  const sharedOne = sharedService.get([directory]);
  const sharedTwo = sharedService.get([directory]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sharedCalls, 1);
  releaseSharedScan();
  await Promise.all([sharedOne, sharedTwo]);
  assert.equal(sharedCalls, 1);

  const seededService = new SearchScanSnapshotService(async () => {
    throw new Error("seeded snapshot should avoid scanning");
  });
  seededService.seed([directory], resultFor(directory, "seeded.txt"));
  assert.equal((await seededService.get([directory])).files[0].file_name, "seeded.txt");
  seededService.invalidate([directory.id]);
  await assert.rejects(() => seededService.get([directory]), /seeded snapshot should avoid scanning/);

  let cancellationStarted;
  const cancellationStartedPromise = new Promise((resolve) => { cancellationStarted = resolve; });
  const cancelledService = new SearchScanSnapshotService(async ([target], control) => {
    cancellationStarted();
    await new Promise((resolve) => setImmediate(resolve));
    if (control.isCancelled()) throw Object.assign(new Error("cancelled"), { code: "ECANCELED" });
    return resultFor(target);
  });
  const cancelledRequest = cancelledService.get([directory]);
  await cancellationStartedPromise;
  cancelledService.setActive(false);
  await assert.rejects(() => cancelledRequest, (error) => error?.code === "ECANCELED");

  let pathChangeCalls = 0;
  const pathChangeService = new SearchScanSnapshotService(async ([target]) => {
    pathChangeCalls += 1;
    return resultFor(target);
  });
  await pathChangeService.get([directory]);
  await pathChangeService.get([{ ...directory, path: "C:\\fixtures\\renamed-root" }]);
  assert.equal(pathChangeCalls, 2);

  console.log(JSON.stringify({
    firstSearchScannedOnce: true,
    snapshotReusedWithinTtl: true,
    snapshotExpiredAtBoundary: true,
    concurrentSearchesSharedScan: true,
    explicitSeedReused: true,
    invalidationForcedRefresh: true,
    inactiveStateCancelledScan: true,
    directoryPathChangeInvalidatedSnapshot: true
  }));
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
