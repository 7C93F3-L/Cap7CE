const assert = require("node:assert/strict");
const { registerCacheActivityIpc } = require("../dist-electron/cacheActivityIpc.js");

const run = async () => {
  const handles = new Map();
  const calls = [];
  registerCacheActivityIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    isMainSenderAllowed: (event) => event.sender.id === 1,
    getCacheStats: () => ({ count: 12 }),
    getOptimizationStatus: () => ({ phase: "running" }),
    setContentViewActive: (active) => calls.push(["content", active]),
    discardQueuedInteractiveThumbnails: () => {
      calls.push(["discard"]);
      return 4;
    },
    setGridInteractionActive: (active) => calls.push(["grid", active])
  });

  assert.deepEqual([...handles.keys()], [
    "cache:stats",
    "cache:optimizationStatus",
    "cache:setContentViewActive",
    "cache:discardQueuedInteractiveThumbnails",
    "cache:setGridInteractionActive"
  ]);

  const trustedEvent = { sender: { id: 1 } };
  const untrustedEvent = { sender: { id: 2 } };
  assert.deepEqual(await handles.get("cache:stats")(untrustedEvent), { count: 12 });
  assert.deepEqual(await handles.get("cache:optimizationStatus")(untrustedEvent), { phase: "running" });

  assert.equal(await handles.get("cache:setContentViewActive")(untrustedEvent, true), false);
  assert.equal(await handles.get("cache:discardQueuedInteractiveThumbnails")(untrustedEvent), 0);
  assert.equal(await handles.get("cache:setGridInteractionActive")(untrustedEvent, true), false);
  assert.deepEqual(calls, []);

  assert.equal(await handles.get("cache:setContentViewActive")(trustedEvent, true), true);
  assert.equal(await handles.get("cache:setContentViewActive")(trustedEvent, 1), true);
  assert.equal(await handles.get("cache:discardQueuedInteractiveThumbnails")(trustedEvent), 4);
  assert.equal(await handles.get("cache:setGridInteractionActive")(trustedEvent, true), true);
  assert.equal(await handles.get("cache:setGridInteractionActive")(trustedEvent, "true"), true);
  assert.deepEqual(calls, [
    ["content", true],
    ["content", false],
    ["discard"],
    ["grid", true],
    ["grid", false]
  ]);

  console.log("Cache activity IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
