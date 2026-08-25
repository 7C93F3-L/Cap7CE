const assert = require("node:assert/strict");
const { registerRuntimeModelIpc } = require("../dist-electron/runtimeModelIpc.js");

const createHarness = (overrides = {}) => {
  const handles = new Map();
  const calls = [];
  const state = { status: "stopped" };
  registerRuntimeModelIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    getRuntimeSettings: () => ({ versions: ["runtime-a"] }),
    updateSelectedRuntime: async (selectedVersion) => {
      calls.push(["updateRuntime", selectedVersion]);
      return { selectedVersion };
    },
    getRuntimeProcessState: () => state,
    startRuntime: () => {
      calls.push(["start"]);
      return { status: "starting" };
    },
    stopRuntime: () => {
      calls.push(["stop"]);
      return { status: "stopped" };
    },
    getModelSettings: () => ({ models: ["model-a"] }),
    updateSelectedModel: async (selectedModelId) => {
      calls.push(["updateModel", selectedModelId]);
      return { selectedModelId };
    },
    syncIdleSelectionState: async () => {
      calls.push(["syncIdle"]);
      return state;
    },
    translateRuntimeSwitchBlocked: () => "stop runtime before switching",
    translateModelSwitchBlocked: () => "stop runtime before switching model",
    ...overrides
  });
  return { handles, calls, state };
};

const run = async () => {
  {
    const { handles } = createHarness();
    assert.deepEqual([...handles.keys()], [
      "llamaRuntime:settings",
      "llamaRuntime:updateSelected",
      "llamaRuntime:processState",
      "llamaRuntime:start",
      "llamaRuntime:stop",
      "ggufModels:settings",
      "ggufModels:updateSelected"
    ]);
  }

  {
    const { handles, calls, state } = createHarness();
    const event = { sender: { id: 1 } };
    assert.deepEqual(await handles.get("llamaRuntime:settings")(event), { versions: ["runtime-a"] });
    assert.equal(await handles.get("llamaRuntime:processState")(event), state);
    assert.deepEqual(await handles.get("llamaRuntime:start")(event), { status: "starting" });
    assert.deepEqual(await handles.get("llamaRuntime:stop")(event), { status: "stopped" });
    assert.deepEqual(await handles.get("ggufModels:settings")(event), { models: ["model-a"] });
    assert.deepEqual(calls, [["start"], ["stop"]]);
  }

  {
    const { handles, calls } = createHarness();
    const event = { sender: { id: 1 } };
    assert.deepEqual(
      await handles.get("llamaRuntime:updateSelected")(event, "runtime-b"),
      { selectedVersion: "runtime-b" }
    );
    assert.deepEqual(
      await handles.get("ggufModels:updateSelected")(event, "model-b"),
      { selectedModelId: "model-b" }
    );
    assert.deepEqual(calls, [
      ["updateRuntime", "runtime-b"],
      ["syncIdle"],
      ["updateModel", "model-b"],
      ["syncIdle"]
    ]);
  }

  for (const activeStatus of ["starting", "running"]) {
    const { handles, calls, state } = createHarness();
    state.status = activeStatus;
    const event = { sender: { id: 1 } };
    await assert.rejects(
      handles.get("llamaRuntime:updateSelected")(event, "runtime-b"),
      /stop runtime before switching/
    );
    await assert.rejects(
      handles.get("ggufModels:updateSelected")(event, "model-b"),
      /stop runtime before switching model/
    );
    assert.deepEqual(calls, []);
  }

  console.log("Runtime/model IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
