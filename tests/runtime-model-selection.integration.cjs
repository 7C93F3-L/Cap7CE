const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-runtime-selection-"));
  const userDataPath = path.join(temporaryRoot, "user-data");
  const runtimeRoot = path.join(temporaryRoot, "llama.cpp");
  const modelsRoot = path.join(temporaryRoot, "models");
  const configRoot = path.join(userDataPath, "config");
  await fs.mkdir(path.join(runtimeRoot, "b-test"), { recursive: true });
  await fs.mkdir(modelsRoot, { recursive: true });
  await fs.mkdir(configRoot, { recursive: true });
  await fs.writeFile(path.join(runtimeRoot, "b-test", "llama-server.exe"), "", "utf8");
  await fs.writeFile(path.join(modelsRoot, "qwen-test-q4.gguf"), "", "utf8");
  await fs.writeFile(path.join(modelsRoot, "mmproj-qwen-test-f16.gguf"), "", "utf8");
  await fs.writeFile(path.join(configRoot, "llama-runtime.json"), JSON.stringify({
    selectedVersion: "b-test",
    updatedAt: new Date().toISOString()
  }), "utf8");
  await fs.writeFile(path.join(configRoot, "gguf-model.json"), JSON.stringify({
    selectedModelId: "previous-model",
    updatedAt: new Date().toISOString()
  }), "utf8");

  const originalLoad = Module._load;
  Module._load = function loadWithElectronMock(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          isPackaged: false,
          getAppPath: () => temporaryRoot,
          getPath: (name) => {
            assert.equal(name, "userData");
            return userDataPath;
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { updateSelectedLlamaRuntime } = require("../dist-electron/llamaRuntimeStore.js");
    const { updateSelectedGgufModel } = require("../dist-electron/ggufModelStore.js");
    const {
      getLlamaRuntimeProcessState,
      startLlamaRuntime,
      syncIdleLlamaRuntimeSelectionState
    } = require("../dist-electron/llamaRuntimeManager.js");

    const runtimeSettings = await updateSelectedLlamaRuntime("");
    assert.equal(runtimeSettings.selectedVersion, "");
    assert.equal(runtimeSettings.status, "unselected");
    const runtimeConfig = JSON.parse(await fs.readFile(path.join(configRoot, "llama-runtime.json"), "utf8"));
    assert.equal(runtimeConfig.selectedVersion, "");

    const modelSettings = await updateSelectedGgufModel("   ");
    assert.equal(modelSettings.selectedModelId, "");
    assert.equal(modelSettings.status, "unselected");
    const modelConfig = JSON.parse(await fs.readFile(path.join(configRoot, "gguf-model.json"), "utf8"));
    assert.equal(modelConfig.selectedModelId, "");

    const failedState = await startLlamaRuntime();
    assert.equal(failedState.status, "failed");

    await updateSelectedLlamaRuntime("b-test");
    await updateSelectedGgufModel("qwen-test-q4.gguf");
    const synchronizedState = await syncIdleLlamaRuntimeSelectionState();
    assert.equal(synchronizedState.status, "stopped");
    assert.equal(synchronizedState.selectedVersion, "b-test");
    assert.equal(synchronizedState.selectedModelId, "qwen-test-q4.gguf");
    assert.equal(synchronizedState.modelStatus, "ready");
    assert.equal(getLlamaRuntimeProcessState().status, "stopped");

    await assert.rejects(() => updateSelectedLlamaRuntime("missing-version"));
    await assert.rejects(() => updateSelectedGgufModel("missing-model"));

    console.log(JSON.stringify({
      runtimeSelectionCleared: true,
      modelSelectionCleared: true,
      staleFailureClearedAfterReselection: true,
      invalidNonEmptySelectionsStillRejected: true
    }));
  } finally {
    Module._load = originalLoad;
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
