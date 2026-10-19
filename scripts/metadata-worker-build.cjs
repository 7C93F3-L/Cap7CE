const fs = require("node:fs/promises");
const path = require("node:path");
const { builtinModules } = require("node:module");
const { build } = require("esbuild");
const copyRuntime = require("./metadata-node-runtime.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/metadata-worker/v1");
const packages = ["sharp", "@img/colour", "@img/sharp-win32-x64", "detect-libc", "semver", "7z-wasm", "readline-sync",
  "pdfjs-dist", "@napi-rs/canvas", "@napi-rs/canvas-win32-x64-msvc"];

(async () => {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Metadata runtime currently targets Windows x64.");
  // Fixed generated directory only. Never traverses source/user data or other artifacts.
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await copyRuntime(root, output);
  const result = await build({ entryPoints: [path.join(root, "electron/metadataExtraction/metadataWorkerProcess.ts")],
    outfile: path.join(output, "worker.cjs"), bundle: true, platform: "node", format: "cjs", target: "node24",
    external: ["sharp", "7z-wasm"], sourcemap: false, metafile: true, logLevel: "error" });
  const imports = Object.values(result.metafile.outputs).flatMap(item => item.imports);
  if (imports.some(item => !item.external || !["sharp", "7z-wasm", "7z-wasm/7zz.wasm"].includes(item.path)
    && !builtinModules.includes(item.path.replace(/^node:/, "")))) throw new Error("Unexpected metadata runtime dependency.");
  for (const name of ["modelFactWorker", "fontMetadataWorker"]) {
    const thread = await build({ entryPoints: [path.join(root, `electron/${name}.ts`)],
      outfile: path.join(output, `${name}.js`), bundle: true, platform: "node", format: "cjs", target: "node24",
      sourcemap: false, metafile: true, logLevel: "error" });
    if (Object.values(thread.metafile.outputs).flatMap(item => item.imports).some(item =>
      !item.external || !builtinModules.includes(item.path.replace(/^node:/, "")))) throw new Error("Unexpected metadata thread dependency.");
  }
  const lock = require("../package-lock.json");
  for (const name of packages) {
    const source = path.join(root, "node_modules", name);
    const metadata = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8"));
    if (metadata.version !== lock.packages[`node_modules/${name}`]?.version) throw new Error(`Unlocked metadata dependency: ${name}`);
    await fs.cp(source, path.join(output, "node_modules", name), { recursive: true, dereference: false,
      filter: file => !/\.(?:map|ts)$/.test(file) && !/(?:^|[\\/])(?:test|tests|\.v8-cache)(?:[\\/]|$)/.test(path.relative(source, file)) });
  }
  // esbuild embeds these modules; retain their complete license files as separate resources.
  for (const name of ["ag-psd", "base64-js", "pako", "fflate"]) {
    const source = path.join(root, "node_modules", name), target = path.join(output, "licenses", name);
    await fs.mkdir(target, { recursive: true });
    for (const entry of await fs.readdir(source)) if (/^(?:license|copying|notice)/i.test(entry))
      await fs.copyFile(path.join(source, entry), path.join(target, entry));
  }
  await fs.writeFile(path.join(output, "package.json"), '{"private":true,"type":"commonjs"}\n');
  console.log("Independent metadata runtime built with pinned Node and locked Windows parsers.");
})().catch(error => { console.error(error); process.exitCode = 1; });
