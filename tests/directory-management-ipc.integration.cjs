const assert = require("node:assert/strict");
const { registerDirectoryManagementIpc } = require("../dist-electron/directoryManagementIpc.js");

const run = async () => {
  const handles = new Map();
  const calls = [];
  const originalDirectories = [{ id: "one", name: "Original", indexedCount: 1 }];
  const renamedDirectories = [{ id: "one", name: "Renamed", indexedCount: 1 }];
  registerDirectoryManagementIpc({
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: () => undefined
    },
    listDirectories: async () => {
      calls.push(["list"]);
      return originalDirectories;
    },
    updateDirectoryName: async (id, name) => {
      calls.push(["updateName", id, name]);
      return renamedDirectories;
    },
    decorateDirectories: async (directories) => {
      calls.push(["decorate", directories]);
      return directories.map((directory) => ({ ...directory, indexedCount: 7 }));
    }
  });

  assert.deepEqual([...handles.keys()], ["directories:list", "directories:updateName"]);
  const event = { sender: { id: 1 } };
  assert.deepEqual(await handles.get("directories:list")(event), [
    { id: "one", name: "Original", indexedCount: 7 }
  ]);
  assert.deepEqual(await handles.get("directories:updateName")(event, "one", "Renamed"), [
    { id: "one", name: "Renamed", indexedCount: 7 }
  ]);
  assert.deepEqual(calls, [
    ["list"],
    ["decorate", originalDirectories],
    ["updateName", "one", "Renamed"],
    ["decorate", renamedDirectories]
  ]);

  console.log("Directory management IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
