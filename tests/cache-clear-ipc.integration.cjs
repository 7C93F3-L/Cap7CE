const assert = require("node:assert/strict");
const { registerCacheClearIpc } = require("../dist-electron/cacheClearIpc.js");

const createHarness = () => {
  const handles = new Map();
  const calls = [];
  let currentTime = 1_000;
  let tokenNumber = 0;
  registerCacheClearIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    createToken: () => `token-${++tokenNumber}`,
    now: () => currentTime,
    authorizationLifetimeMs: 30_000,
    translateConfirmationRequired: () => "confirmation required",
    clearFormalCache: async () => {
      calls.push(["formal"]);
      return { count: 0 };
    },
    clearThumbnailCache: async () => {
      calls.push(["thumbnails"]);
      return { count: 1 };
    },
    getSkimCacheStats: () => ({ count: 3 }),
    clearSkimCache: async () => {
      calls.push(["skim"]);
      return { count: 0 };
    }
  });
  return {
    handles,
    calls,
    setTime: (value) => { currentTime = value; }
  };
};

const run = async () => {
  const event = { sender: { id: 1 } };
  {
    const { handles } = createHarness();
    assert.deepEqual([...handles.keys()], [
      "cache:authorizeClear",
      "cache:clearAll",
      "cache:clearThumbnails",
      "skimCache:stats",
      "skimCache:authorizeClear",
      "skimCache:clear"
    ]);
    assert.deepEqual(await handles.get("skimCache:stats")(event), { count: 3 });
  }

  {
    const { handles, calls } = createHarness();
    const token = await handles.get("cache:authorizeClear")(event);
    assert.deepEqual(await handles.get("cache:clearThumbnails")(event, token), { count: 1 });
    assert.deepEqual(calls, [["thumbnails"]]);
    await assert.rejects(handles.get("cache:clearAll")(event, token), /confirmation required/);
  }

  {
    const { handles, calls } = createHarness();
    const token = await handles.get("cache:authorizeClear")(event);
    assert.equal(token, "token-1");
    assert.deepEqual(await handles.get("cache:clearAll")(event, token), { count: 0 });
    assert.deepEqual(calls, [["formal"]]);
    await assert.rejects(handles.get("cache:clearAll")(event, token), /confirmation required/);
  }

  {
    const { handles, calls } = createHarness();
    const token = await handles.get("skimCache:authorizeClear")(event);
    assert.equal(token, "token-1");
    assert.deepEqual(await handles.get("skimCache:clear")(event, token), { count: 0 });
    assert.deepEqual(calls, [["skim"]]);
    await assert.rejects(handles.get("skimCache:clear")(event, token), /confirmation required/);
  }

  {
    const { handles, calls, setTime } = createHarness();
    const token = await handles.get("cache:authorizeClear")(event);
    setTime(31_000);
    assert.deepEqual(await handles.get("cache:clearAll")(event, token), { count: 0 });
    assert.deepEqual(calls, [["formal"]]);
  }

  {
    const { handles, calls, setTime } = createHarness();
    const token = await handles.get("cache:authorizeClear")(event);
    setTime(31_001);
    await assert.rejects(handles.get("cache:clearAll")(event, token), /confirmation required/);
    assert.deepEqual(calls, []);
  }

  {
    const { handles, calls } = createHarness();
    const formalToken = await handles.get("cache:authorizeClear")(event);
    const skimToken = await handles.get("skimCache:authorizeClear")(event);
    await assert.rejects(handles.get("cache:clearAll")(event, skimToken), /confirmation required/);
    await assert.rejects(handles.get("skimCache:clear")(event, formalToken), /confirmation required/);
    assert.deepEqual(calls, []);
  }

  console.log("Cache clear IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
