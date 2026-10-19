const assert = require("node:assert/strict");
const { CoreMetadataProtocol } = require("../dist-electron/core/coreMetadataProtocol.js");
const volumeId = "1".repeat(32), fileReference = "2".repeat(16), leaseId = "3".repeat(32);
const source = { sizeBytes: "123", modifiedFileTime: "134040960000000001", volumeEpoch: "1", contentRevision: "0" };
const job = { identity: { volumeId, fileReference }, kind: 0, extractorVersion: 1 };
const ticket = { fullPath: "C:\\生成样本\\图像.png", lease: { leaseId, job, source, expiresUnixMilliseconds: 1900000000000 } };
const requests = [];
let response;
const protocol = new CoreMetadataProtocol({ async request(operation, body, deadline) {
  requests.push({ operation, body: JSON.parse(JSON.stringify(body)), deadline });
  return JSON.parse(JSON.stringify(response));
} });

(async () => {
  const policy = { volumeOrder: [volumeId], includes: [{ volumeId, rootFileReference: null }], excludes: [] };
  await assert.rejects(protocol.configure(policy, false), /confirmation-required/);
  assert.equal(requests.length, 0, "absence of explicit confirmation never sends configuration");
  response = { state: "active", ledger: null };
  assert.equal((await protocol.configure(policy, true)).state, "active");
  assert.equal(requests[0].deadline, 120000);

  const changeSpecifications = [{ kind: 0, extractorVersion: 2, extensions: [".png"] }, { kind: 8, extractorVersion: 2, extensions: [".zip"] }];
  response = { jobsDiscovered: 128, acknowledged: false, hasMore: true };
  assert.deepEqual(await protocol.consumeChanges(changeSpecifications), response);
  assert.equal(requests.at(-1).operation, "metadata.consumeChanges");
  assert.equal(requests.at(-1).body.pageSize, 128);
  assert.deepEqual(requests.at(-1).body.specifications, changeSpecifications);
  for (const malformed of [{ jobsDiscovered: 129, acknowledged: false, hasMore: true },
    { jobsDiscovered: -1, acknowledged: false, hasMore: true }, { jobsDiscovered: 1, acknowledged: 1, hasMore: true },
    { jobsDiscovered: 1, acknowledged: false, hasMore: "true" }]) {
    response = malformed;
    await assert.rejects(protocol.consumeChanges(changeSpecifications), /invalid-response/);
  }
  const beforeInvalid = requests.length;
  await assert.rejects(protocol.consumeChanges([]), /invalid-change-specification/);
  await assert.rejects(protocol.consumeChanges([changeSpecifications[0], changeSpecifications[0]]), /invalid-change-specification/);
  await assert.rejects(protocol.consumeChanges([{ kind: 0, extractorVersion: 2, extensions: ["../source"] }]), /invalid-change-specification/);
  assert.equal(requests.length, beforeInvalid, "invalid dispatch specifications never reach Core");

  response = { state: 0, ticket: JSON.parse(JSON.stringify(ticket)), retryAfterUnixMilliseconds: null };
  const claim = await protocol.claim();
  assert.equal(claim.ticket.lease.source.modifiedFileTime, source.modifiedFileTime);
  assert.deepEqual(protocol.task(claim.ticket), { kind: "image-dimensions", filePath: ticket.fullPath });
  response.ticket.lease.source.modifiedFileTime = Number(source.modifiedFileTime);
  await assert.rejects(protocol.claim(), /invalid-response/, "numeric FILETIME loses exactness and must be rejected");
  response = { state: 0, ticket: { ...ticket, lease: { ...ticket.lease, source: { ...source, modifiedFileTime: "9223372036854775808" } } }, retryAfterUnixMilliseconds: null };
  await assert.rejects(protocol.claim(), /invalid-response/);
  response = { state: 0, ticket: { ...ticket, fullPath: "\\\\server\\share\\image.png" }, retryAfterUnixMilliseconds: null };
  await assert.rejects(protocol.claim(), /invalid-response/);
  response = { state: 1, ticket: null, retryAfterUnixMilliseconds: null };
  assert.equal((await protocol.claim()).state, 1);

  response = { completion: 0 };
  assert.equal(await protocol.complete(leaseId, { state: "indexed", width: 37, height: 23 }), 0);
  const completion = requests.at(-1).body;
  assert.deepEqual(completion, { leaseId, result: { state: 0, width: 37, height: 23, durationMilliseconds: null, errorCode: null } });
  assert.equal(Object.hasOwn(completion, "source"), false);
  const { imageMetadataMetrics } = require("../dist-electron/metadataExtraction/imageMetadataMetrics.js");
  const properties = Object.fromEntries(imageMetadataMetrics.map(key => [key, 0])); properties["colorRatio.red"] = 10000;
  await protocol.complete(leaseId, { state: "indexed", width: 37, height: 23, isAnimated: true, visualProperties: properties });
  assert.equal(requests.at(-1).body.result.isAnimated, true);
  assert.deepEqual(requests.at(-1).body.result.visualProperties, properties, "flat image properties stay exact in the protected completion payload");
  await protocol.complete(leaseId, { state: "indexed", width: 37, height: 23, isAnimated: null, visualProperties: null });
  assert.equal(requests.at(-1).body.result.isAnimated, null); assert.equal(requests.at(-1).body.result.visualProperties, null);
  await protocol.complete(leaseId, { state: "failed", errorCode: "metadata-read-failed" });
  assert.equal(requests.at(-1).body.result.state, 3);
  response = { completion: "Published" };
  await assert.rejects(protocol.complete(leaseId, { state: "failed", errorCode: "metadata-read-failed" }), /invalid-response/);

  response = { jobs: [job], next: { volumeId, fileReference, specificationHash: "A".repeat(64) } };
  assert.equal((await protocol.discover(0, 1, [".png"], null)).jobs.length, 1);
  response.next.specificationHash = "bad";
  await assert.rejects(protocol.discover(0, 1, [".png"], null), /invalid-response/);
  response = { renewed: false };
  assert.equal(await protocol.renew(leaseId), false);
  response = { state: "paused", ledger: null };
  assert.equal((await protocol.pause()).state, "paused");
  response = { state: "active", ledger: { policyEpoch: 1, pendingJobs: 4, leasedJobs: 1, completedJobs: 3, nextLeaseExpiryUnixMilliseconds: null } };
  assert.equal((await protocol.status(0, 1)).ledger.pendingJobs, 4);
  response.ledger.pendingJobs = -1;
  await assert.rejects(protocol.status(0, 1), /invalid-response/);
  let rejectPending, cancelledId;
  const cancellable = new CoreMetadataProtocol({
    request() { throw new Error("unexpected non-cancellable request"); },
    startRequest() { return { requestId: "metadata-cancellation-fixture", response: new Promise((_resolve, reject) => { rejectPending = reject; }) }; },
    async cancel(id) { cancelledId = id; rejectPending(new Error("cancelled-by-Core")); return true; }
  });
  const abort = new AbortController();
  const preparing = cancellable.configure(policy, true, abort.signal);
  abort.abort();
  await assert.rejects(preparing, /cancelled-by-Core/);
  assert.equal(cancelledId, "metadata-cancellation-fixture", "pause propagates cancellation to the active Core request");
  console.log("Core metadata protocol adapter tests passed.");
  response = { completion: 0 };
  await protocol.complete(leaseId, { state: "indexed", durationMilliseconds: 500, channelCount: 2 });
  assert.deepEqual(requests.at(-1).body.result, { state: 0, width: null, height: null, durationMilliseconds: 500, channelCount: 2, errorCode: null });
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 2 } } }).kind, "audio");
  await protocol.complete(leaseId, { state: "indexed", modelProperties: { parameterCount: 3_000_000_001, precision: "4bit" } });
  assert.deepEqual(requests.at(-1).body.result.modelProperties, { parameterCount: 3_000_000_001, precision: "4bit" });
  assert.equal(requests.at(-1).body.result.width, null);
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 4 } } }).kind, "model");
  await protocol.complete(leaseId, { state: "indexed", documentProperties: { artboardCount: 0 } });
  assert.deepEqual(requests.at(-1).body.result.documentProperties, { artboardCount: 0 });
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 5 } } }).kind, "document");
  await protocol.complete(leaseId, { state: "indexed", threeDProperties: { triangleCount: 0, hasAnimation: false, hasRig: false } });
  assert.deepEqual(requests.at(-1).body.result.threeDProperties, { triangleCount: 0, hasAnimation: false, hasRig: false });
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 6 } } }).kind, "three-d");
  await protocol.complete(leaseId, { state: "indexed", textDataProperties: { factKind: "json", recordCount: 0, jsonRootKind: "array" } });
  assert.deepEqual(requests.at(-1).body.result.textDataProperties, { factKind: "json", recordCount: 0, jsonRootKind: "array" });
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 7 } } }).kind, "text-data");
  await protocol.complete(leaseId, { state: "indexed", archiveProperties: { listingComplete: true, fileCount: 0, hasDirectories: false, contentTypes: [] } });
  assert.equal(requests.at(-1).body.result.archiveProperties.fileCount, 0);
  assert.equal(protocol.task({ ...ticket, lease: { ...ticket.lease, job: { ...job, kind: 8 } } }).kind, "archive");
  response = { completion: 0, state: "indexed" };
  assert.deepEqual(await protocol.execute(leaseId), response);
  assert.equal(requests.at(-1).operation, "metadata.execute");
  assert.deepEqual(requests.at(-1).body, { leaseId }, "execution sends no source paths or caller-supplied facts");
  await assert.rejects(protocol.execute("arbitrary-path"), /invalid-lease/);
  for (const invalidResponse of [{ completion: 0, state: null }, { completion: "0", state: "indexed" }, { completion: 1, state: "unexpected" }]) {
    response = invalidResponse; await assert.rejects(protocol.execute(leaseId), /invalid/);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
