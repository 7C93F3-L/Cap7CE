const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { registerManualMetadataIpc } = require("../dist-electron/manualMetadataIpc.js");

const run = async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-manual-metadata-ipc-"));
  try {
    const parentPath = path.join(testRoot, "parent");
    const nestedPath = path.join(parentPath, "nested");
    const visualPath = path.join(nestedPath, "visual.png");
    const textPath = path.join(parentPath, "notes.txt");
    await fs.mkdir(nestedPath, { recursive: true });
    await fs.writeFile(visualPath, "visual");
    await fs.writeFile(textPath, "notes");

    const handles = new Map();
    const calls = [];
    const singleUpdates = [];
    const allowedSender = { id: 1 };
    const directories = [
      { id: "parent", path: parentPath },
      { id: "nested", path: nestedPath }
    ];
    registerManualMetadataIpc({
      registrar: {
        handle: (channel, listener) => handles.set(channel, listener),
        on: () => undefined
      },
      isSingleSenderAllowed: (event) => event.sender === allowedSender,
      isBatchSenderAllowed: (event) => event.sender === allowedSender,
      listDirectories: async () => {
        calls.push(["list"]);
        return directories;
      },
      upsertFileKeywords: async (...args) => calls.push(["file", ...args]),
      updateKeywordsBatch: async (...args) => {
        calls.push(["batch", ...args]);
        return ["shared", "new"];
      },
      translate: (key, parameters = {}) => parameters.path ? `${key}:${parameters.path}` : key,
      onSingleKeywordsUpdated: (...args) => singleUpdates.push(args),
      now: () => new Date("2026-08-21T12:34:56.000Z")
    });

    assert.deepEqual([...handles.keys()], [
      "index:updateManualKeywords",
      "index:updateKeywordsBatch"
    ]);
    const allowedEvent = { sender: allowedSender };
    assert.deepEqual(await handles.get("index:updateManualKeywords")(
      allowedEvent,
      visualPath,
      "first, second, first"
    ), ["first", "second"]);
    assert.deepEqual(await handles.get("index:updateManualKeywords")(
      allowedEvent,
      textPath,
      "document"
    ), ["document"]);

    assert.deepEqual(calls[0], ["list"]);
    assert.equal(calls[1][0], "file");
    assert.equal(calls[1][1].directory_id, "nested");
    assert.equal(calls[1][1].file_path, path.resolve(visualPath));
    assert.deepEqual(calls[1][2], ["first", "second"]);
    assert.equal(calls[1][3], "2026-08-21T12:34:56.000Z");
    assert.deepEqual(calls[2], ["list"]);
    assert.equal(calls[3][0], "file");
    assert.equal(calls[3][1].directory_id, "parent");
    assert.deepEqual(calls[3][2], ["document"]);
    assert.equal(calls[3][3], "2026-08-21T12:34:56.000Z");
    assert.equal(singleUpdates.length, 2);
    assert.equal(singleUpdates[0][0], allowedEvent);
    assert.equal(singleUpdates[0][1], path.resolve(visualPath));
    assert.deepEqual(singleUpdates[0][2], ["first", "second"]);

    const batchResult = await handles.get("index:updateKeywordsBatch")(allowedEvent, {
      targets: [{ filePath: visualPath }, { filePath: textPath }],
      initialCommonKeywords: [" shared ", "shared"],
      targetKeywordText: "shared, new"
    });
    assert.deepEqual(batchResult, {
      success: true,
      totalCount: 2,
      failedCount: 0,
      errorMessage: "",
      normalizedKeywordText: "shared,new"
    });
    const batchCall = calls.find((call) => call[0] === "batch");
    assert.deepEqual(batchCall[1].map((target) => ({
      directoryId: target.file.directory_id,
      resultKind: target.resultKind
    })), [
      { directoryId: "nested", resultKind: "visual" },
      { directoryId: "parent", resultKind: "file" }
    ]);
    assert.deepEqual(batchCall[2], ["shared"]);
    assert.equal(batchCall[3], "shared, new");

    const unauthorizedResult = await handles.get("index:updateKeywordsBatch")(
      { sender: { id: 2 } },
      { targets: [{ filePath: visualPath }], initialCommonKeywords: [], targetKeywordText: "new" }
    );
    assert.deepEqual(unauthorizedResult, {
      success: false,
      totalCount: 1,
      failedCount: 1,
      errorMessage: "error.invalidBatchKeywordSource",
      normalizedKeywordText: "new"
    });

    const duplicateResult = await handles.get("index:updateKeywordsBatch")(allowedEvent, {
      targets: [{ filePath: visualPath }, { filePath: visualPath.toUpperCase() }],
      initialCommonKeywords: [],
      targetKeywordText: "duplicate"
    });
    assert.equal(duplicateResult.success, false);
    assert.equal(duplicateResult.errorMessage, "error.duplicateBatchKeywordTarget");
    assert.equal(duplicateResult.failedCount, 2);

    await assert.rejects(
      handles.get("index:updateManualKeywords")({ sender: { id: 2 } }, visualPath, "tag"),
      /error\.invalidMetadata/
    );
    await assert.rejects(
      handles.get("index:updateManualKeywords")(allowedEvent, path.join(testRoot, "outside.png"), "tag"),
      /error\.fileOutsideAddedDirectories/
    );
    await assert.rejects(
      handles.get("index:updateManualKeywords")(allowedEvent, nestedPath, "tag"),
      /error\.invalidFile/
    );

    console.log("Manual metadata IPC integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
