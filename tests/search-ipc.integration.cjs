const assert = require("node:assert/strict");
const { registerSearchIpc } = require("../dist-electron/searchIpc.js");

const handlers = new Map();
const diagnosticEvents = [];
const detailedEvents = [];
const refreshes = [];
let releaseSearch;
let observedCancellation = null;

const controller = registerSearchIpc({
  registrar: {
    handle: (channel, listener) => handlers.set(channel, listener),
    on: () => undefined
  },
  isSenderAllowed: (event) => event.allowed === true,
  translateSearchFailed: () => "search failed",
  listDirectories: async () => [{ id: "directory-1" }],
  search: async (_request, _directories, options) => {
    observedCancellation = options.isCancelled;
    await new Promise((resolve) => {
      releaseSearch = resolve;
    });
    return { images: [{ extension: ".png", previewKind: "image", failureType: "pending" }] };
  },
  refresh: (ids) => refreshes.push(ids),
  diagnostics: {
    startOperation: (event, data) => {
      diagnosticEvents.push({ event, data });
      return {
        complete: (completion) => diagnosticEvents.push({ event: `${event}.completed`, data: completion }),
        fail: (error) => diagnosticEvents.push({ event: `${event}.failed`, error })
      };
    },
    logDetailed: (event, data) => detailedEvents.push({ event, data })
  }
});

assert.deepEqual([...handlers.keys()], ["search:images", "search:cancel", "search:refresh"]);

const run = async () => {
  await assert.rejects(() => handlers.get("search:images")({ allowed: false }, {}, "task-1"), /search failed/);
  const pending = handlers.get("search:images")({ allowed: true }, {
    query: "private phrase",
    directoryId: "directory-1",
    fileFormat: "all",
    sortField: "modified_at",
    sortDirection: "desc"
  }, "task-1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(observedCancellation(), false);
  assert.equal(await handlers.get("search:cancel")({ allowed: true }, "task-1"), true);
  assert.equal(observedCancellation(), true);
  releaseSearch();
  const result = await pending;
  assert.equal(result.images.length, 1);
  assert.equal(diagnosticEvents[0].data.queryLength, 14);
  assert.equal(JSON.stringify(diagnosticEvents).includes("private phrase"), false);
  assert.equal(detailedEvents[0].data.extensions[".png"], 1);

  assert.equal(await handlers.get("search:refresh")({ allowed: true }, ["one", 2, ""]), true);
  assert.deepEqual(refreshes, [["one"]]);
  controller.cancelAll();
  console.log(JSON.stringify({ searchIpc: "ok", channels: handlers.size }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

