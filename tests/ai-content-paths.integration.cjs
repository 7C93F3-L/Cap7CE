const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const repositoryRoot = path.resolve(__dirname, "..");
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-ai-content-paths-"));
  const developmentRoot = path.join(temporaryRoot, "development root");
  const executablePath = path.join(temporaryRoot, "已安装 Cap7CE", "Cap7CE.exe");
  const userDataPath = path.join(temporaryRoot, "local data", "Cap7CE", "UserData");
  const originalLoad = Module._load;

  Module._load = function loadWithElectronMock(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          isPackaged: true,
          getAppPath: () => developmentRoot,
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
    const { resolveAiContentPaths } = require("../dist-electron/aiContentPaths.js");
    const packagedPaths = resolveAiContentPaths({
      isPackaged: true,
      appPath: developmentRoot,
      executablePath,
      userDataPath
    });
    const expectedProgramRoot = path.dirname(executablePath);
    const expectedContentRoot = path.dirname(userDataPath);
    assert.equal(packagedPaths.programRoot, expectedProgramRoot);
    assert.equal(packagedPaths.runtimeRoot, path.join(expectedContentRoot, "llama.cpp"));
    assert.equal(packagedPaths.modelsRoot, path.join(expectedContentRoot, "models"));

    const developmentPaths = resolveAiContentPaths({
      isPackaged: false,
      appPath: developmentRoot,
      executablePath,
      userDataPath
    });
    assert.equal(developmentPaths.programRoot, developmentRoot);
    assert.equal(developmentPaths.runtimeRoot, path.join(developmentRoot, "llama.cpp"));
    assert.equal(developmentPaths.modelsRoot, path.join(developmentRoot, "models"));

    assert.equal(await fs.stat(expectedProgramRoot).then(() => true, () => false), false);
    assert.equal(await fs.stat(developmentRoot).then(() => true, () => false), false);

    const packageConfig = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"));
    assert.equal(Object.hasOwn(packageConfig.build, "afterPack"), false);
    assert.equal(await fs.stat(path.join(repositoryRoot, "scripts", "afterPack.cjs")).then(() => true, () => false), false);

    const runtimeStoreSource = await fs.readFile(path.join(repositoryRoot, "electron", "llamaRuntimeStore.ts"), "utf8");
    const modelStoreSource = await fs.readFile(path.join(repositoryRoot, "electron", "ggufModelStore.ts"), "utf8");
    const pathModuleSource = await fs.readFile(path.join(repositoryRoot, "electron", "aiContentPaths.ts"), "utf8");
    const clientSource = await fs.readFile(path.join(repositoryRoot, "electron/core/coreModelSettingsClient.ts"), "utf8");
    assert.match(clientSource, /getAiContentPaths\(\)/);
    assert.match(runtimeStoreSource, /requestCoreModelSettings/);
    assert.match(modelStoreSource, /requestCoreModelSettings/);
    for (const source of [runtimeStoreSource, modelStoreSource]) {
      assert.doesNotMatch(source, /PORTABLE_EXECUTABLE_DIR|resourcesPath|process\.cwd\(\)/);
    }
    assert.doesNotMatch(pathModuleSource, /node:fs|mkdir|rename|copyFile|rm\(/);

    console.log(JSON.stringify({
      packagedPathsUseWritableLocalDataRoot: true,
      developmentPathsStayInsideAppRoot: true,
      resolutionDoesNotCreateDirectories: true,
      portableEmptyDirectoryHookRemoved: true
    }));
  } finally {
    Module._load = originalLoad;
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
