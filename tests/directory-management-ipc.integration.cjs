const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { registerDirectoryManagementIpc } = require("../dist-electron/directoryManagementIpc.js");

const run = async () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "App.tsx"), "utf8");
  const resultRefreshSource = appSource.slice(
    appSource.indexOf('if (view === "home" || view === "results")'),
    appSource.indexOf("  };", appSource.indexOf('if (view === "home" || view === "results")'))
  );
  assert.match(resultRefreshSource, /directories\.refreshFileCounts\(directoryIds\)/u);
  assert.doesNotMatch(resultRefreshSource, /search\.refresh/u);

  const handles = new Map();
  const calls = [];
  const originalDirectories = [{ id: "one", name: "Original", path: "C:\\Original", indexedCount: 1 }];
  const renamedDirectories = [{ id: "one", name: "Renamed", path: "C:\\Original", indexedCount: 1 }];
  const addedDirectory = { id: "added", name: "Added", indexedCount: 0 };
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
    },
    selectDirectoryCandidates: async () => {
      calls.push(["select"]);
      return ["C:\\Added"];
    },
    createCancelledDirectoryAddResult: async () => ({ cancelled: true, directories: originalDirectories }),
    addDirectoryCandidates: async (request) => {
      calls.push(["addCandidates", request]);
      return { cancelled: false, directories: [addedDirectory] };
    },
    scanDirectories: async (directories) => {
      calls.push(["scan", directories]);
      return {
        images: [{ file_path: "C:\\Original\\image.png" }],
        files: [{ file_path: "C:\\Original\\notes.txt" }],
        scannedAt: "scan-time",
        summaries: [{ id: "one", fileCount: 9 }]
      };
    },
    seedScanSnapshot: (directories, scanResult) => calls.push(["seed", directories, scanResult]),
    writeScannedFiles: async (...args) => calls.push(["write", ...args]),
    applyDirectoryFileCounts: async (counts) => {
      calls.push(["applyCounts", counts]);
      return originalDirectories;
    },
    pauseThumbnailOptimization: async (reason) => calls.push(["pauseOptimization", reason]),
    pauseThumbnailRendering: async (reason) => calls.push(["pauseRendering", reason]),
    waitForThumbnailDiscovery: async () => calls.push(["waitDiscovery"]),
    invalidateSearchSnapshot: (directoryIds) => calls.push(["invalidate", directoryIds]),
    deleteDirectoryIndex: async (directoryId) => {
      calls.push(["deleteIndex", directoryId]);
      if (directoryId === "fail") throw new Error("delete failed");
      return ["C:\\Original\\image.png"];
    },
    discardEmbeddedMetadataCandidates: async (directoryPath) => calls.push(["discardEmbeddedMetadata", directoryPath]),
    discardOptimizationCandidates: (directoryPath) => calls.push(["discardOptimization", directoryPath]),
    discardQueuedRenders: (directoryPath) => calls.push(["discardRenders", directoryPath]),
    deleteDirectoryThumbnails: async (directoryPath, filePaths) => calls.push(["deleteDirectoryThumbnails", directoryPath, filePaths]),
    deleteFileThumbnails: async (filePaths) => calls.push(["deleteFileThumbnails", filePaths]),
    deleteDirectory: async (directoryId) => {
      calls.push(["deleteDirectory", directoryId]);
      return [];
    },
    resumeThumbnailRendering: (reason) => calls.push(["resumeRendering", reason]),
    resumeThumbnailOptimization: (reason) => calls.push(["resumeOptimization", reason])
  });

  assert.deepEqual([...handles.keys()], [
    "directories:list",
    "directories:updateName",
    "directories:selectAndAdd",
    "directories:addCandidates",
    "directories:refreshFileCounts",
    "directories:delete"
  ]);
  const event = { sender: { id: 1 } };
  assert.deepEqual(await handles.get("directories:list")(event), [
    { id: "one", name: "Original", path: "C:\\Original", indexedCount: 7 }
  ]);
  assert.deepEqual(await handles.get("directories:updateName")(event, "one", "Renamed"), [
    { id: "one", name: "Renamed", path: "C:\\Original", indexedCount: 7 }
  ]);
  assert.deepEqual(await handles.get("directories:selectAndAdd")(event), {
    cancelled: false,
    directories: [{ ...addedDirectory, indexedCount: 7 }]
  });
  assert.deepEqual(await handles.get("directories:addCandidates")(event, {
    candidates: ["C:\\External"],
    conflictResolution: "replace-existing"
  }), {
    cancelled: false,
    directories: [{ ...addedDirectory, indexedCount: 7 }]
  });
  const refreshResult = await handles.get("directories:refreshFileCounts")(event, ["one", 7]);
  assert.deepEqual(refreshResult, [{ ...originalDirectories[0], indexedCount: 7 }]);
  const scanResult = {
    images: [{ file_path: "C:\\Original\\image.png" }],
    files: [{ file_path: "C:\\Original\\notes.txt" }],
    scannedAt: "scan-time",
    summaries: [{ id: "one", fileCount: 9 }]
  };
  assert.deepEqual(await handles.get("directories:delete")(event, "one"), []);
  assert.deepEqual(calls, [
    ["list"],
    ["decorate", originalDirectories],
    ["updateName", "one", "Renamed"],
    ["decorate", renamedDirectories],
    ["select"],
    ["addCandidates", { candidates: ["C:\\Added"] }],
    ["decorate", [addedDirectory]],
    ["addCandidates", { candidates: ["C:\\External"], conflictResolution: "replace-existing" }],
    ["decorate", [addedDirectory]],
    ["list"],
    ["scan", originalDirectories],
    ["seed", originalDirectories, scanResult],
    ["write", ["one"], scanResult.images, "scan-time", scanResult.files],
    ["applyCounts", { one: 9 }],
    ["decorate", originalDirectories],
    ["list"],
    ["pauseOptimization", "directory-delete:one"],
    ["pauseRendering", "directory-delete:one"],
    ["waitDiscovery"],
    ["invalidate", ["one"]],
    ["discardEmbeddedMetadata", "C:\\Original"],
    ["deleteIndex", "one"],
    ["discardOptimization", "C:\\Original"],
    ["discardRenders", "C:\\Original"],
    ["deleteDirectoryThumbnails", "C:\\Original", ["C:\\Original\\image.png"]],
    ["deleteDirectory", "one"],
    ["decorate", []],
    ["resumeRendering", "directory-delete:one"],
    ["resumeOptimization", "directory-delete:one"]
  ]);
  await assert.rejects(handles.get("directories:delete")(event, "fail"), /delete failed/);
  assert.deepEqual(calls.slice(-8), [
    ["list"],
    ["pauseOptimization", "directory-delete:fail"],
    ["pauseRendering", "directory-delete:fail"],
    ["waitDiscovery"],
    ["invalidate", ["fail"]],
    ["deleteIndex", "fail"],
    ["resumeRendering", "directory-delete:fail"],
    ["resumeOptimization", "directory-delete:fail"]
  ]);

  const cancelledHandles = new Map();
  const cancelledCalls = [];
  registerDirectoryManagementIpc({
    registrar: {
      handle: (channel, listener) => cancelledHandles.set(channel, listener),
      on: () => undefined
    },
    listDirectories: async () => [],
    updateDirectoryName: async () => [],
    decorateDirectories: async (directories) => {
      cancelledCalls.push(["decorate", directories]);
      return directories;
    },
    selectDirectoryCandidates: async () => null,
    createCancelledDirectoryAddResult: async () => {
      cancelledCalls.push(["cancelledResult"]);
      return { cancelled: true, directories: [] };
    },
    addDirectoryCandidates: async () => {
      cancelledCalls.push(["unexpectedAdd"]);
      return { cancelled: false, directories: [] };
    },
    scanDirectories: async () => {
      cancelledCalls.push(["unexpectedScan"]);
      return { images: [], files: [], scannedAt: "", summaries: [] };
    },
    seedScanSnapshot: () => undefined,
    writeScannedFiles: async () => undefined,
    applyDirectoryFileCounts: async () => [],
    pauseThumbnailOptimization: async () => undefined,
    pauseThumbnailRendering: async () => undefined,
    waitForThumbnailDiscovery: async () => undefined,
    invalidateSearchSnapshot: () => undefined,
    deleteDirectoryIndex: async () => [],
    discardEmbeddedMetadataCandidates: async () => undefined,
    discardOptimizationCandidates: () => undefined,
    discardQueuedRenders: () => undefined,
    deleteDirectoryThumbnails: async () => undefined,
    deleteFileThumbnails: async () => undefined,
    deleteDirectory: async () => [],
    resumeThumbnailRendering: () => undefined,
    resumeThumbnailOptimization: () => undefined
  });
  assert.deepEqual(await cancelledHandles.get("directories:selectAndAdd")(event), {
    cancelled: true,
    directories: []
  });
  assert.deepEqual(cancelledCalls, [["cancelledResult"], ["decorate", []]]);
  assert.deepEqual(await cancelledHandles.get("directories:refreshFileCounts")(event, ["missing"]), []);
  assert.deepEqual(cancelledCalls, [
    ["cancelledResult"],
    ["decorate", []],
    ["decorate", []]
  ]);

  console.log("Directory management IPC integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
