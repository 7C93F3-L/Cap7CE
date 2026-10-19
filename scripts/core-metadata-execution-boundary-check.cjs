const fs = require("node:fs"), path = require("node:path");
module.exports = (root, failures) => {
  const directory = "core/src/Cap7CE.Core.Host/MetadataWorkers/";
  const files = [["MetadataWorkerJob.cs", 50], ["NodeMetadataResources.cs", 35], ["NodeMetadataResponse.cs", 60], ["NodeMetadataWorker.cs", 125], ["NodeMetadataJson.cs", 25], ["MetadataExtractorManifest.cs", 45]];
  const actual = fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith(".cs")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(files.map(([name]) => name).sort())) failures.push("Core metadata worker source inventory changed without an ownership audit.");
  for (const [name, maximum] of files) {
    const text = fs.readFileSync(path.join(root, directory, name), "utf8");
    if (text.split(/\r?\n/).length > maximum || /Sqlite|sqlite|Reader\.Host|System\.Net|HttpClient|ShellExecute\s*=\s*true|File\.(?:Write|Delete|Move)|Directory\.(?:Create|Delete|Move)/.test(text))
      failures.push(`Core metadata executor ${name} crosses its ordinary decoder ownership boundary.`);
  }
  const text = files.map(([name]) => fs.readFileSync(path.join(root, directory, name), "utf8")).join("\n");
  const manifest = require(path.join(root, "third_party/node-runtime/manifest.json"));
  for (const anchor of [manifest.sha256, "AssignProcessToJobObject", "0x2000", "UseShellExecute = false", "--stdio", "TimeSpan.FromSeconds(14)", "256 * 1024", "NODE_OPTIONS", "NODE_PATH", "ReadExactlyAsync", "job?.Dispose()"])
    if (!text.includes(anchor)) failures.push(`Core metadata executor is missing ${anchor}.`);
  const controller = fs.readFileSync(path.join(root, "electron/metadataExtraction/metadataBuildController.ts"), "utf8");
  if (/MetadataWorkerClient|workerFactory|protocol\.(?:complete|task)\(/.test(controller) || !controller.includes("this.protocol.execute(ticket.lease.leaseId"))
    failures.push("Shell metadata controller must only request lease execution, without source reading or fact publication.");
  if (controller.split(/\r?\n/).length > 190) failures.push("Shell metadata controller exceeds its reduced orchestration boundary.");
  for (const [file, maximum] of [["FileFactExecutionOwner.cs", 65], ["IFileFactContentReader.cs", 15], ["FileFactHostSession.cs", 235], ["FileFactExtractionBroker.cs", 160]])
    if (fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/MetadataExtraction", file), "utf8").split(/\r?\n/).length > maximum)
      failures.push(`${file} exceeds its metadata ownership boundary.`);
};
