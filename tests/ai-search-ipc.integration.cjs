const assert = require("node:assert/strict");
const { registerAiSearchIpc } = require("../dist-electron/aiSearchIpc.js");

const run = async () => {
  const handles = new Map();
  const sent = [];
  let cancelled = null;
  registerAiSearchIpc({
    registrar: { handle: (channel, listener) => handles.set(channel, listener), on: () => undefined },
    isMainSenderAllowed: () => true,
    startSearch: async (request, emit) => {
      emit({ type: "status", sessionId: request.sessionId, phase: "running", processed: 0, total: 2 });
      return { accepted: true, totalCandidates: 2, visualTerms: ["沙漠"] };
    },
    cancelSearch: (sessionId, discard) => { cancelled = { sessionId, discard }; return true; }
  });
  const event = { sender: { isDestroyed: () => false, send: (...args) => sent.push(args) } };
  const request = {
    sessionId: "session-123",
    search: { query: "沙漠", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc" },
    excludeFilePaths: []
  };
  assert.deepEqual(await handles.get("aiSearch:start")(event, request), { accepted: true, totalCandidates: 2, visualTerms: ["沙漠"] });
  assert.equal(sent[0][0], "aiSearch:update");
  assert.equal(await handles.get("aiSearch:cancel")(event, "session-123"), true);
  assert.deepEqual(cancelled, { sessionId: "session-123", discard: false });
  assert.equal(await handles.get("aiSearch:cancel")(event, "session-123", true), true);
  assert.deepEqual(cancelled, { sessionId: "session-123", discard: true });
  await assert.rejects(handles.get("aiSearch:start")(event, { ...request, sessionId: "x" }), /参数无效/);
  console.log("AI search IPC validation and update forwarding tests passed.");
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
