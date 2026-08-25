const assert = require("node:assert/strict");
const { registerFileIpc } = require("../dist-electron/fileIpc.js");

const createHarness = (overrides = {}) => {
  const handles = new Map();
  const events = new Map();
  const calls = [];
  const warnings = [];
  const dependencies = {
    registrar: {
      handle: (channel, listener) => handles.set(channel, listener),
      on: (channel, listener) => events.set(channel, listener)
    },
    isPackaged: false,
    isClipboardSenderAllowed: (event) => event.sender.id === 1,
    openPath: async (filePath) => {
      calls.push(["openPath", filePath]);
      return "";
    },
    showItemInFolder: (filePath) => calls.push(["showItemInFolder", filePath]),
    normalizeClipboardPaths: (filePaths) => Array.isArray(filePaths)
      ? filePaths.filter((filePath) => typeof filePath === "string")
      : [],
    writeClipboardText: (text) => calls.push(["writeClipboardText", text]),
    copyFileItems: async (filePaths) => {
      calls.push(["copyFileItems", filePaths]);
      return Array.isArray(filePaths) ? filePaths.length : 0;
    },
    moveFilesToTrash: async (filePaths) => {
      calls.push(["moveFilesToTrash", filePaths]);
      return {
        success: true,
        totalCount: filePaths.length,
        deletedPaths: filePaths,
        failedItems: []
      };
    },
    startFileDrag: (sender, filePaths) => calls.push(["startFileDrag", sender, filePaths]),
    translateFileDeleteServiceFailure: () => "delete service unavailable",
    translateFileDragStartFailure: () => "drag unavailable",
    logger: {
      debug: (message, details) => calls.push(["debug", message, details]),
      warn: (message, details) => warnings.push([message, details])
    },
    ...overrides
  };
  registerFileIpc(dependencies);
  return { handles, events, calls, warnings };
};

const run = async () => {
  {
    const { handles, events, calls } = createHarness();
    assert.deepEqual([...handles.keys()], [
      "file:open",
      "file:showInFolder",
      "file:copyPaths",
      "file:copyItems",
      "file:moveToTrash"
    ]);
    assert.deepEqual([...events.keys()], ["file:startDrag"]);

    const trustedEvent = { sender: { id: 1 } };
    assert.equal(await handles.get("file:open")(trustedEvent, "C:\\sample.txt"), "");
    await handles.get("file:showInFolder")(trustedEvent, "C:\\sample.txt");
    assert.deepEqual(calls.slice(0, 2), [
      ["openPath", "C:\\sample.txt"],
      ["showItemInFolder", "C:\\sample.txt"]
    ]);
  }

  {
    const { handles, calls } = createHarness();
    const trustedEvent = { sender: { id: 1 } };
    const untrustedEvent = { sender: { id: 2 } };
    const paths = ["C:\\one.txt", "C:\\two.txt"];

    assert.equal(await handles.get("file:copyPaths")(untrustedEvent, paths), 0);
    assert.equal(await handles.get("file:copyItems")(untrustedEvent, paths), 0);
    assert.equal(calls.some(([name]) => name === "writeClipboardText" || name === "copyFileItems"), false);

    assert.equal(await handles.get("file:copyPaths")(trustedEvent, paths), 2);
    assert.equal(await handles.get("file:copyItems")(trustedEvent, paths), 2);
    assert.deepEqual(calls.filter(([name]) => name === "writeClipboardText" || name === "copyFileItems"), [
      ["writeClipboardText", "C:\\one.txt\r\nC:\\two.txt"],
      ["copyFileItems", paths]
    ]);
  }

  {
    const copyError = new Error("clipboard failed");
    const { handles, warnings } = createHarness({
      copyFileItems: async () => { throw copyError; }
    });
    assert.equal(await handles.get("file:copyItems")({ sender: { id: 1 } }, ["C:\\one.txt"]), 0);
    assert.equal(warnings[0][0], "[file-clipboard] failed to copy file items");
    assert.deepEqual(warnings[0][1], { message: "clipboard failed" });
  }

  {
    const { handles, calls } = createHarness();
    const result = await handles.get("file:moveToTrash")(
      { sender: { id: 99 } },
      ["C:\\one.txt", "", 7, "C:\\two.txt"]
    );
    assert.equal(result.success, true);
    assert.deepEqual(result.deletedPaths, ["C:\\one.txt", "C:\\two.txt"]);
    assert.deepEqual(calls.find(([name]) => name === "moveFilesToTrash"), [
      "moveFilesToTrash",
      ["C:\\one.txt", "C:\\two.txt"]
    ]);
  }

  {
    const { handles, warnings } = createHarness({
      moveFilesToTrash: async () => { throw "unknown"; }
    });
    const result = await handles.get("file:moveToTrash")(
      { sender: { id: 99 } },
      ["C:\\one.txt"]
    );
    assert.deepEqual(result, {
      success: false,
      totalCount: 1,
      deletedPaths: [],
      failedItems: [{ path: "C:\\one.txt", error: "delete service unavailable" }]
    });
    assert.equal(warnings[0][0], "[file-delete:ipc] failed before a result was produced");
  }

  {
    const { events, calls } = createHarness();
    const sender = { id: 3 };
    const paths = ["C:\\one.txt"];
    events.get("file:startDrag")({ sender }, paths);
    assert.deepEqual(calls.find(([name]) => name === "startFileDrag"), ["startFileDrag", sender, paths]);
  }

  {
    const { events, warnings } = createHarness({
      startFileDrag: () => { throw "unknown"; }
    });
    events.get("file:startDrag")({ sender: { id: 3 } }, ["C:\\one.txt"]);
    assert.deepEqual(warnings[0], ["[file-drag] failed", { message: "drag unavailable" }]);
  }

  console.log("File IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
