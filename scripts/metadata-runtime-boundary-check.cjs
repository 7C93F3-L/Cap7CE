const fs = require("node:fs"), path = require("node:path");
module.exports = (root, failures) => {
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const client = read("electron/metadataExtraction/metadataWorkerClient.ts");
  const paths = read("electron/metadataExtraction/metadataWorkerPaths.ts");
  if (/spawn\(process\.execPath|ELECTRON_RUN_AS_NODE:\s*["']1/.test(client)) failures.push("Metadata execution depends on Electron's executable.");
  if (!client.includes("spawn(runtime.executable") || !client.includes('"NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"'))
    failures.push("Metadata execution must use its owned runtime and sanitize executable injection.");
  if (/from ["']electron|app\.asar|process\.execPath|process\.env/.test(paths) || paths.split(/\r?\n/).length > 20)
    failures.push("Metadata resource resolution must remain independent of shell APIs and external runtime overrides.");
  const manifest = JSON.parse(read("third_party/node-runtime/manifest.json"));
  if (!/^https:\/\/nodejs\.org\/dist\/v[0-9.]+\/win-x64\/node\.exe$/.test(manifest.url) || !/^[a-f0-9]{64}$/.test(manifest.sha256))
    failures.push("Independent Node requires a pinned official source and SHA256.");
  if (!read("third_party/node-runtime/LICENSE").includes("Copyright Node.js contributors")) failures.push("Independent Node license is missing.");
  const builder = read("scripts/metadata-worker-build.cjs");
  if (!builder.includes("pdfjs-dist") || !builder.includes("fontMetadataWorker") || !builder.includes("modelFactWorker"))
    failures.push("Metadata runtime must include dynamically loaded parsers and threads.");
  const config = JSON.parse(read("package.json"));
  if (!config.scripts["build:electron"].includes("build:metadata-worker") || !config.scripts["test:video-fact"].includes("metadata-runtime.integration.cjs"))
    failures.push("Build/test lifecycle does not validate the independent metadata runtime.");
  const resource = config.build.extraResources.find(item => item.to === "metadata-worker/v1");
  if (resource?.from !== "artifacts/metadata-worker/v1" || JSON.stringify(resource.filter) !== '["**/*"]')
    failures.push("Independent metadata runtime packaging is missing.");
};
