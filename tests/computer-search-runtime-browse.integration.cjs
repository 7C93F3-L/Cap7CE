const assert = require("node:assert/strict");
const controllerModule = require("../dist-electron/core/coreHostController.js");
const saved = controllerModule.CoreHostController;
const requests = [];
let scopeState = "ready", scopeResolved = true;
const volume = { volumeId: "A".repeat(32), displayName: "X:", fileSystem: "NTFS", selected: true,
  state: "ready", processed: 1, total: 1, queryable: true, needsRebuild: false };
class FixtureController {
  supports(capability) { return capability === "search.live"; }
  async start() { return { state: "ready" }; }
  async stop() {}
  async cancelRequest() { return true; }
  async request(operation, body) {
    if (operation === "volume.list") return { volumes: [volume] };
    if (operation === "catalog.status") return { volumes: [volume], tasks: [], catalogRevision: 1 };
    if (operation === "catalog.resolveScope") return { resolved: scopeResolved, queryable: scopeState === "ready", state: scopeState, volumeId: volume.volumeId,
      rootFileReference: body.path === "X:\\" ? null : "1".repeat(16),
      directoryFileReference: body.path === "X:\\MissingRoot" ? null : body.path === "X:\\" ? "5".repeat(16) : "1".repeat(16) };
    if (operation === "volume.selection" || operation === "catalog.build") return {};
    throw Error(`unexpected-operation-${operation}`);
  }
  startRequest(operation, body) {
    requests.push({ operation, body });
    return { requestId: String(requests.length), response: Promise.resolve({ items: [{ name: "poster.png", relativePath: "Library\\poster.png",
      volumeId: volume.volumeId, fileReference: "2".repeat(16), isDirectory: false, extension: ".png" }],
      nextCursor: null, isComplete: true, catalogRevision: 1 }) };
  }
}
controllerModule.CoreHostController = FixtureController;
const { createComputerSearchRuntime } = require("../dist-electron/computerSearchRuntime.js");
(async () => {
  const runtime = createComputerSearchRuntime({ packaged: false, productVersion: "test" });
  try {
    const initial = await runtime.search({ taskId: "empty-browse", query: "", scopePath: null });
    assert.equal(initial.items.length, 1); assert.equal(requests[0].body.entryType, "file");
    assert.equal(requests[0].body.textTarget, "name-or-path"); assert.equal(requests[0].body.query, "");
    assert.equal(requests[0].body.continuation, "live", "advertised live paging keeps catalog updates from retiring UI continuations");
    await runtime.search({ taskId: "path-search", query: "Library", scopePath: "X:\\Library" });
    assert.equal(requests[1].body.textTarget, "name-or-path"); assert.equal(requests[1].body.entryType, "any");
    assert.deepEqual(requests[1].body.volumeIds, [volume.volumeId]);
    assert.equal(requests[1].body.scope.rootFileReference, "1".repeat(16));
    await runtime.search({ taskId: "dimension-search", query: "poster", scopePath: "X:\\Library",
      facts: { kind: "image-dimensions", minimumWidth: 1000, minimumAspectRatio: { numerator: 4, denominator: 3 } } });
    assert.equal(requests[2].body.entryType, "file");
    assert.equal(requests[2].body.facts.minimumWidth, 1000);
    assert.equal(requests[2].body.facts.extractorVersion, require("../dist-electron/metadataExtraction/imageMetadataMetrics.js").CORE_IMAGE_METADATA_EXTRACTOR_VERSION);
    assert.equal(requests[2].body.scope.rootFileReference, "1".repeat(16));
    await runtime.search({ taskId: "duration-search", query: "", scopePath: null,
      facts: { kind: "video", minimumDurationMilliseconds: 30_000, maximumDurationMilliseconds: 60_000 } });
    assert.equal(requests[3].body.facts.extractorVersion, require("../dist-electron/videoFactTypes.js").VIDEO_FACT_EXTRACTOR_VERSION);
    await assert.rejects(runtime.search({ taskId: "bad-facts", query: "", scopePath: null, facts: { kind: "video", maximumWidth: -1 } }));
    assert.equal(requests.length, 4, "invalid facts cannot dispatch a query");
    const fileConditions = { extensions: [".png"], minimumSizeBytes: 100, minimumModifiedFileTime: "133000000000000003" };
    await runtime.search({ taskId: "base-filter-search", query: "", scopePath: "X:\\Library", fileConditions,
      facts: { kind: "image-dimensions", minimumWidth: 1000 } });
    assert.deepEqual(requests[4].body.fileConditions, fileConditions);
    assert.equal(requests[4].body.facts.minimumWidth, 1000); assert.equal(requests[4].body.entryType, "file");
    assert.ok(runtime.resolveAuthorizedItem({ taskId: "empty-browse", authorizationId: initial.items[0].authorizationId }));
    const thumbnailAuthorization = { taskId: "empty-browse", authorizationId: initial.items[0].authorizationId };
    const thumbnailLease = runtime.thumbnailLeases.acquire(thumbnailAuthorization);
    assert.ok(thumbnailLease); assert.ok(runtime.getVisualSessionId("empty-browse"));
    await runtime.cancel("empty-browse");
    assert.equal(runtime.thumbnailLeases.session(thumbnailAuthorization, thumbnailLease), null);
    assert.equal(runtime.getVisualSessionId("empty-browse"), null);
    assert.equal(runtime.resolveAuthorizedItem({ taskId: "empty-browse", authorizationId: initial.items[0].authorizationId }), null);
    await runtime.search({ taskId: "root-children", query: "", scopePath: "X:\\", scopeKind: "direct-children" });
    assert.equal(requests.at(-1).body.entryType, "any", "folders must remain visible without file filters");
    assert.deepEqual(requests.at(-1).body.scope, { kind: "direct-children", volumeId: volume.volumeId, rootFileReference: "5".repeat(16) });
    await runtime.search({ taskId: "folder-children", query: "", scopePath: "X:\\Library", scopeKind: "direct-children", fileConditions });
    assert.equal(requests.at(-1).body.entryType, "file", "file filters still intersect direct children");
    assert.equal(requests.at(-1).body.scope.rootFileReference, "1".repeat(16));
    const beforeInvalid = requests.length;
    await assert.rejects(runtime.search({ taskId: "missing-root", query: "", scopePath: "X:\\MissingRoot", scopeKind: "direct-children" }), /scope-not-indexed/);
    await assert.rejects(runtime.search({ taskId: "null-root", query: "", scopePath: null, scopeKind: "direct-children" }), /invalid-request/);
    await assert.rejects(runtime.search({ taskId: "bad-kind", query: "", scopePath: "X:\\", scopeKind: "unknown" }), /invalid-request/);
    assert.equal(requests.length, beforeInvalid, "invalid child scope cannot widen into whole-volume search");
    await runtime.search({ taskId: "recursive-drive", query: "", scopePath: "X:\\" });
    assert.deepEqual(requests.at(-1).body.scope, { kind: "all-volumes" });
    assert.deepEqual(requests.at(-1).body.volumeIds, [volume.volumeId]);
    await runtime.search({taskId:"ordered-children",query:"",scopePath:"X:\\",scopeKind:"direct-children",sort:"modified-descending",excludeHidden:true});
    assert.equal(requests.at(-1).body.sort,"modified-descending");assert.equal(requests.at(-1).body.excludeHidden,true);assert.equal(requests.at(-1).body.entryType,"any","hidden control must preserve folder results");
    const dispatched = requests.length;
    for (const state of ["building", "discovering", "offline", "ready"]) {
      scopeState = state; scopeResolved = false;
      await assert.rejects(runtime.search({ taskId: "scope-" + state, query: "", scopePath: "X:\\Pending", scopeKind: "direct-children" }),
        state === "offline" ? /scope-offline/ : state === "ready" ? /scope-not-indexed/ : /scope-preparing/);
    }
    assert.equal(requests.length, dispatched, "preparing and missing scopes never broaden into whole-drive queries");
    scopeState = "ready"; scopeResolved = true;
    await runtime.search({ taskId: "scope-recovered", query: "", scopePath: "X:\\Pending", scopeKind: "direct-children" });
    assert.equal(requests.length, dispatched + 1, "the same location recovers after publication");
    for (const query of ["", "poster"]) {
      await runtime.search({taskId:"recursive-explicit-"+(query||"all"),query,scopePath:"X:\\Library",scopeKind:"directory-descendants",sort:"modified-descending",excludeHidden:true});
      assert.deepEqual(requests.at(-1).body.scope,{kind:"directory-descendants",volumeId:volume.volumeId,rootFileReference:"1".repeat(16)});
      assert.equal(requests.at(-1).body.entryType,"file","flat recursive view excludes folder results even with keywords");
      assert.equal(requests.at(-1).body.sort,"modified-descending");assert.equal(requests.at(-1).body.excludeHidden,true);
    }
    await assert.rejects(runtime.search({taskId:"recursive-no-path",query:"",scopePath:null,scopeKind:"directory-descendants"}),/invalid-request/);
    console.log("Core empty/child browsing, path matching and result authorization tests passed.");
  } finally { await runtime.stop(); controllerModule.CoreHostController = saved; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
