const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { createHash } = require("node:crypto"), { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (["artifacts", "bin", "obj"].includes(entry.name)) return [];
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : entry.name === "packages.lock.json" ? [file] : [];
});
const fingerprint = () => walk(path.join(root, "core")).map(file => [path.relative(root, file), createHash("sha256").update(fs.readFileSync(file)).digest("hex")]);
const before = fingerprint();
for (const args of [
  ["core/Cap7CE.Core.sln"],
  ["core/src/Cap7CE.Core.Host/Cap7CE.Core.Host.csproj", "-p:P38ProductProfile=true", "-p:PlatformTarget=x64"],
  ["core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj", "-p:P38ProductProfile=true", "-p:PlatformTarget=x64"],
  ["core/src/Cap7CE.Core.Setup/Cap7CE.Core.Setup.csproj", "-p:P38ProductProfile=true"],
  ["core/Cap7CE.Core.sln"]
]) {
  const result = spawnSync("dotnet", ["restore", ...args, "--locked-mode", "--nologo"], {
    cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" }
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(fingerprint(), before, "default/product/native restore must not rewrite dependency locks");
}
// A failed restore may not remove or start replacing an existing working development host.
const vm = require("node:vm"); let removed = false;
assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/core-development-host-build.cjs"), "utf8"), {
  require(name) { if (name === "node:fs") return { rmSync() { removed = true; } };
    if (name === "node:child_process") return { spawnSync: () => ({ status: 1 }) };
    if (name.startsWith("./")) return require(path.join(root, "scripts", name)); return require(name); },
  process: { platform: "win32", env: {} }, __dirname: path.join(root, "scripts"), console
}), /restore failed/);
assert.equal(removed, false);
assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/core-development-host-build.cjs"), "utf8"), {
  require(name) { if (name === "node:fs") return { rmSync() { removed = true; } };
    if (name === "node:child_process") return { spawnSync: () => ({ status: 0 }) };
    if (name === "./core-development-host-safety.cjs") return { assertStopped() { throw Error("development-host-in-use"); } };
    if (name.startsWith("./")) return require(path.join(root, "scripts", name)); return require(name); },
  process: { platform: "win32", env: {} }, __dirname: path.join(root, "scripts"), console
}), /development-host-in-use/);
assert.equal(removed, false, "active owner refusal cannot partially clear its working directory");
// Existing AOT executables must be rebuilt when the SDK baseline changes, even if source files are unchanged.
const buildSource = fs.readFileSync(path.join(root, "scripts/native-build.cjs"), "utf8");
const sdkBaseline = JSON.parse(fs.readFileSync(path.join(root, "global.json"), "utf8")).sdk.version;
for (const stamp of ["10.0.401", sdkBaseline]) {
  const calls = []; let recorded;
  vm.runInNewContext(buildSource, {
    require(name) {
      if (name === "node:fs") return {
        existsSync: () => true, mkdirSync() {}, writeFileSync(file, value) { recorded = value; },
        readFileSync: file => file.endsWith("global.json") ? JSON.stringify({ sdk: { version: sdkBaseline } }) : stamp
      };
      if (name === "node:child_process") return { spawnSync(exe, args) { calls.push(args); return { status: 0 }; } };
      if (name === "./native-build-safety.cjs") return () => {};
      if (["./core-file-operations-freshness.cjs", "./core-visuals-freshness.cjs"].includes(name)) return { isFresh: () => true };
      if (name === "./core-development-host-safety.cjs") return { assertStopped() {} };
      return require(name);
    },
    process: { platform: "win32", execPath: process.execPath, env: {} }, __dirname: path.join(root, "scripts"), console: { log() {} }
  });
  for (const script of ["core-configuration-build.cjs", "core-file-operations-build.cjs", "core-capability-payload-build.cjs"])
    assert.equal(calls.some(args => args.some(arg => String(arg).endsWith(script))), stamp !== sdkBaseline, `SDK change must invalidate ${script}`);
  assert.equal(recorded, sdkBaseline);
}
console.log("Core restore: supported profiles retain identical locks; failed restore and active-owner refusal preserve the working host.");
