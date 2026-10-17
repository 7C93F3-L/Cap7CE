const assert = require("node:assert/strict");
const { registerComputerSearchIpc } = require("../dist-electron/computerSearchIpc.js");

const handlers = new Map();
const events = new Map();
const calls = [];
const authorizationId = "A".repeat(32);
const authorizedItem = { authorizationId, path: "E:\\Catalog\\poster.psd", isDirectory: false };
const runtime = {
  status: async () => ({ state: "ready", searchAvailable: true, catalogRevision: 7, volumes: [] }),
  capabilityOptions: async () => ({ bundleAvailable: true, runtimeReady: true, busy: false, volumes: [],
    runtimeInstall: { phase: "idle", receivedBytes: 0, totalBytes: null } }),
  configureCapability: async (request) => { calls.push(["configureCapability", request]);
    return { status: "completed", reason: "capability-ready" }; },
  search: async (request) => {
    calls.push(["search", request]);
    return { taskId: request.taskId, items: [], nextCursor: "cursor-1", isComplete: false, catalogRevision: 7 };
  },
  nextPage: async (request) => {
    calls.push(["nextPage", request]);
    return { taskId: request.taskId, items: [], nextCursor: null, isComplete: true, catalogRevision: 7 };
  },
  cancel: async (taskId) => { calls.push(["cancel", taskId]); return true; },
  resolveAuthorizedItem: (request) => request.taskId === "task-1" && request.authorizationId === authorizationId
    ? authorizedItem : null,
  resolveAuthorizedItems: (request) => request.taskId === "task-1"
    && request.authorizationIds.every((id) => id === authorizationId) ? [authorizedItem] : null,
  getVisualSessionId: () => "computer-search:task-1",
  stop: async () => undefined
};

registerComputerSearchIpc({
  registrar: { handle: (channel, listener) => handlers.set(channel, listener), on: (channel, listener) => events.set(channel, listener) },
  isSenderAllowed: (event) => event.allowed === true,
  isActionSenderAllowed: (event) => event.actionAllowed === true,
  runtime,
  openPath: async (filePath) => { calls.push(["open", filePath]); return ""; },
  showItemInFolder: (filePath) => calls.push(["showInFolder", filePath]),
  writeClipboardText: (text) => calls.push(["clipboard", text]),
  inspectItem: async (filePath, kind) => { calls.push(["inspect", filePath, kind]); return { path: filePath, kind }; },
  readTextPreview: async (filePath) => { calls.push(["text", filePath]); return { content: "sample" }; },
  startFileDrag: (_sender, filePaths) => calls.push(["drag", filePaths])
});

assert.deepEqual([...handlers.keys()], [
  "computerSearch:readFileDetails", "computerSearch:cancelFileDetails",
  "computerSearch:acquireThumbnail", "computerSearch:releaseThumbnail",
  "computerSearch:moveToTrash",
  "computerSearch:status", "computerSearch:capabilityOptions", "computerSearch:configureCapability",
  "computerSearch:search", "computerSearch:nextPage", "computerSearch:cancel",
  "computerSearch:open", "computerSearch:showInFolder", "computerSearch:copyPaths",
  "computerSearch:inspect", "computerSearch:readTextPreview"
]);
assert.deepEqual([...events.keys()], ["computerSearch:startDrag"]);
assert.equal(handlers.has("search:images"), false);

const run = async () => {
  const detailsRequest = { taskId: "task-1", authorizationId, requestId: "details-1" };
  await assert.rejects(() => handlers.get("computerSearch:readFileDetails")({ allowed: false }, detailsRequest), /not allowed/);
  await assert.rejects(() => handlers.get("computerSearch:readFileDetails")({ allowed: true }, { ...detailsRequest, authorizationId: "forged" }), /invalid-authorization/);
  await assert.rejects(() => handlers.get("computerSearch:readFileDetails")({ allowed: true }, { ...detailsRequest, taskId: "expired" }), /authorization-expired/);
  await assert.rejects(() => handlers.get("computerSearch:cancelFileDetails")({ allowed: false }, detailsRequest), /not allowed/);
  await assert.rejects(() => handlers.get("computerSearch:status")({ allowed: false }), /not allowed/);
  await assert.rejects(() => handlers.get("computerSearch:moveToTrash")({ allowed: false }), /not allowed/);
  await assert.rejects(() => handlers.get("computerSearch:moveToTrash")({ allowed: true }, { paths: ["C:\\forged.txt"] }), /invalid-authorization/);
  await assert.rejects(() => handlers.get("computerSearch:moveToTrash")({ allowed: true }, { taskId: "expired", authorizationIds: [authorizationId] }), /authorization-expired/);
  await assert.rejects(() => handlers.get("computerSearch:moveToTrash")({ allowed: true }, { taskId: "task-1", authorizationIds: Array(201).fill(authorizationId) }), /invalid-authorization/);
  assert.equal((await handlers.get("computerSearch:status")({ allowed: true })).catalogRevision, 7);
  assert.equal((await handlers.get("computerSearch:capabilityOptions")({ allowed: true })).bundleAvailable, true);
  await assert.rejects(() => handlers.get("computerSearch:configureCapability")({ allowed: true }, {
    action: "enable", volumeLetters: ["e"], removeCatalog: false
  }), /invalid-capability-request/);
  await assert.rejects(() => handlers.get("computerSearch:configureCapability")({ allowed: true }, {
    action: "remove", volumeLetters: ["E"], removeCatalog: false
  }), /invalid-capability-request/);
  assert.equal((await handlers.get("computerSearch:configureCapability")({ allowed: true }, {
    action: "enable", volumeLetters: ["C", "E"], removeCatalog: false
  })).status, "completed");
  await assert.rejects(() => handlers.get("computerSearch:search")({ allowed: true }, {
    taskId: "task-1", query: 1, scopePath: null
  }), /invalid-request/);
  await assert.rejects(() => handlers.get("computerSearch:search")({ allowed: true }, {
    taskId: "task-1", query: "poster", scopePath: "relative"
  }), /invalid-request/);
  for(const options of [{sort:'bogus'},{excludeHidden:'yes'}])await assert.rejects(()=>handlers.get("computerSearch:search")({allowed:true},{taskId:'invalid-options',query:'',scopePath:null,...options}),/invalid-request/);
  for (const randomSeed of [-1,0x100000000,1.5,'42']) await assert.rejects(()=>handlers.get("computerSearch:search")({allowed:true},{taskId:'invalid-random',query:'',scopePath:null,randomSeed}),/invalid-request/);
  const first = await handlers.get("computerSearch:search")({ allowed: true }, {
    taskId: "task-1", query: "  poster  ", scopePath: "E:\\References"
  });
  assert.equal(first.nextCursor, "cursor-1");
  assert.deepEqual(calls[1], ["search", { taskId: "task-1", query: "poster", scopePath: "E:\\References" }]);
  await handlers.get("computerSearch:search")({allowed:true},{taskId:'sorted',query:'',scopePath:'X:\\',scopeKind:'direct-children',sort:'modified-descending',excludeHidden:true});
  assert.equal(calls.at(-1)[1].sort,'modified-descending');assert.equal(calls.at(-1)[1].excludeHidden,true);calls.pop();
  await handlers.get("computerSearch:search")({allowed:true},{taskId:'seed-zero',query:'',scopePath:null,randomSeed:0});assert.equal(calls.at(-1)[1].randomSeed,0);calls.pop();
  await handlers.get("computerSearch:search")({allowed:true},{taskId:'recursive',query:'poster',scopePath:'X:\\Folder',scopeKind:'directory-descendants'});
  assert.equal(calls.at(-1)[1].scopeKind,'directory-descendants');calls.pop();
  for (const scopeKind of ['directory-descendants','bogus']) await assert.rejects(()=>handlers.get("computerSearch:search")({allowed:true},{taskId:'invalid-scope',query:'',scopePath:null,scopeKind}),/invalid-request/);
  await assert.rejects(() => handlers.get("computerSearch:nextPage")({ allowed: true }, {
    taskId: "task-1", cursor: ""
  }), /invalid-cursor/);
  assert.equal((await handlers.get("computerSearch:nextPage")({ allowed: true }, {
    taskId: "task-1", cursor: "cursor-1"
  })).isComplete, true);
  assert.equal(await handlers.get("computerSearch:cancel")({ allowed: true }, "task-1"), true);
  assert.deepEqual(calls.slice(2, 4), [
    ["nextPage", { taskId: "task-1", cursor: "cursor-1" }], ["cancel", "task-1"]
  ]);
  const authorization = { taskId: "task-1", authorizationId, path: "C:\\not-authorized.txt" };
  await assert.rejects(() => handlers.get("computerSearch:open")({ actionAllowed: false }, authorization), /not allowed/);
  await assert.rejects(() => handlers.get("computerSearch:open")({ actionAllowed: true }, {
    taskId: "task-1", authorizationId: "B".repeat(32)
  }), /authorization-expired/);
  assert.equal(await handlers.get("computerSearch:open")({ actionAllowed: true }, authorization), "");
  assert.equal(await handlers.get("computerSearch:showInFolder")({ actionAllowed: true }, authorization), true);
  assert.equal(await handlers.get("computerSearch:copyPaths")({ actionAllowed: true }, {
    taskId: "task-1", authorizationIds: [authorizationId]
  }), 1);
  assert.equal((await handlers.get("computerSearch:inspect")({ actionAllowed: true }, authorization)).path, authorizedItem.path);
  assert.equal((await handlers.get("computerSearch:readTextPreview")({ actionAllowed: true }, authorization)).content, "sample");
  events.get("computerSearch:startDrag")({ actionAllowed: true, sender: { id: 1 } }, {
    taskId: "task-1", authorizationIds: [authorizationId]
  });
  assert.deepEqual(calls.slice(4), [
    ["open", authorizedItem.path],
    ["showInFolder", authorizedItem.path],
    ["clipboard", authorizedItem.path],
    ["inspect", authorizedItem.path, "file"],
    ["text", authorizedItem.path],
    ["drag", [authorizedItem.path]]
  ]);
  await handlers.get("computerSearch:search")({ allowed: true }, { taskId: "browse", query: "   ", scopePath: null });
  assert.deepEqual(calls.at(-1), ["search", { taskId: "browse", query: "", scopePath: null }]);
  await handlers.get("computerSearch:search")({ allowed: true }, { taskId: "children", query: "", scopePath: "E:\\", scopeKind: "direct-children" });
  assert.equal(calls.at(-1)[1].scopeKind, "direct-children");
  for (const request of [{ scopePath: null, scopeKind: "direct-children" }, { scopePath: "E:\\", scopeKind: "recursive" }])
    await assert.rejects(handlers.get("computerSearch:search")({ allowed: true }, { taskId: "invalid-children", query: "", ...request }), /invalid-request/);
  await handlers.get("computerSearch:search")({ allowed: true }, { taskId: "facts", query: "", scopePath: null,
    facts: { kind: "video", minimumDurationMilliseconds: 30000 } });
  assert.deepEqual(calls.at(-1)[1].facts, { kind: "video", minimumDurationMilliseconds: 30000 });
  const beforeInvalid = calls.length;
  await assert.rejects(handlers.get("computerSearch:search")({ allowed: true }, { taskId: "facts", query: "", scopePath: null,
    facts: { kind: "video", extractorVersion: 99 } }));
  assert.equal(calls.length, beforeInvalid);
  console.log(JSON.stringify({ computerSearchIpc: "ok", channels: handlers.size + events.size,
    formalSearchUntouched: true, arbitraryPathsRejected: true }));
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
