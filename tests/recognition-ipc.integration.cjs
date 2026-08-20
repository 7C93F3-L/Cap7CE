const assert = require("node:assert/strict");
const { registerRecognitionIpc } = require("../dist-electron/recognitionIpc.js");

const run = async () => {
  const handles = new Map();
  const calls = [];
  registerRecognitionIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    getQualityStats: async () => ({ pending: 4 }),
    beginRecognition: () => calls.push(["begin"]),
    cleanupMissingFiles: async () => {
      calls.push(["cleanup"]);
      return { errors: ["first", "second"], removedFilePaths: ["C:\\missing.png"] };
    },
    reportCleanupWarning: (message) => calls.push(["warning", message]),
    runRecognition: async () => {
      calls.push(["run"]);
      return { ai: { completed: 2 }, stats: { pending: 2 } };
    },
    cancelRecognition: () => calls.push(["cancel"])
  });

  assert.deepEqual([...handles.keys()], [
    "index:qualityStats",
    "index:continueRecognition",
    "index:cancelRecognition"
  ]);

  const event = { sender: { id: 1 } };
  assert.deepEqual(await handles.get("index:qualityStats")(event), { pending: 4 });
  assert.deepEqual(await handles.get("index:continueRecognition")(event), {
    ai: { completed: 2 },
    stats: { pending: 2 },
    removedFilePaths: ["C:\\missing.png"]
  });
  assert.equal(await handles.get("index:cancelRecognition")(event), true);
  assert.deepEqual(calls, [
    ["begin"],
    ["cleanup"],
    ["warning", "first"],
    ["warning", "second"],
    ["run"],
    ["cancel"]
  ]);

  console.log("Recognition IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
