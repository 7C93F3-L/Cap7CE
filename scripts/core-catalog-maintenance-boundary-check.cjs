const fs = require("node:fs");
const path = require("node:path");

module.exports = (root, sourceFiles, failures) => {
  const directory = path.join(root, "core/src/Cap7CE.Core.Host/CatalogMaintenance");
  for (const name of fs.readdirSync(directory).filter((name) => name.endsWith(".cs"))) {
    const source = fs.readFileSync(path.join(directory, name), "utf8");
    if (/System\.Net|HttpClient|DeviceIoControl|File\.(?:Read|Write|Delete|Move|Copy)|Directory\.(?:Enumerate|GetFiles|Delete|Move)|PeriodicTimer|new\s+(?:System\.)?Timer\b/.test(source)) {
      failures.push(`Catalog maintenance ${name} bypasses its event-only identity boundary.`);
    }
  }
  const diagnostic = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/CatalogPreparationDiagnostics.cs"), "utf8");
  if (/PeriodicTimer|Task\.Delay|new\s+(?:System\.)?Timer|Exception\.Message|error\.Message|error\.StackTrace/.test(diagnostic) || diagnostic.split(/\r?\n/).length > 100)
    failures.push("Catalog diagnostics must remain small, path-free and timer-free.");
  const read = (name) => fs.readFileSync(path.join(directory, name), "utf8");
  const checks = new Map([
    ["CatalogJournalMonitor.cs", ["MaximumPagesPerTurn = 16", "if (wake.TimedOut) continue;", "reader.WaitForChangesAsync", "TimeSpan.FromMinutes(25)", "SynchronizeConnectedAsync(reader", "CatalogJournalPageOwner.CreateAsync"]],
    ["CatalogReaderOwnership.cs", ["await RetireMonitorAsync();", "await operation(linked.Token)", "await monitorTask", "shutdown.Cancel();"]],
    ["CatalogJournalPageOwner.cs", ["token.ThrowIfCancellationRequested(); validateRoots();", "cursor.CompleteVolatile(advance)", "ApplyMaintenanceBatchAsync", "cursor.CompletePersisted", "stage.Complete(publication)", "retired = true"]]
  ]);
  for (const [name, anchors] of checks) {
    const source = read(name);
    for (const anchor of anchors) if (!source.includes(anchor)) failures.push(`Catalog maintenance ${name} is missing ${anchor}.`);
  }
  if (/Sqlite|CatalogV2Database|Task\.Delay/.test(read("CatalogChangeSignal.cs"))) failures.push("Catalog notification waits must use cached state without database polling.");
  const dispatch = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/CoreRequestDispatcher.cs"), "utf8");
  const lane = dispatch.indexOf("request.Operation == CoreOperations.CatalogAwaitChanges && runtime?.MaintenanceEnabled == true");
  if (lane < 0 || lane > dispatch.indexOf("await executionSlots.WaitAsync")) failures.push("Catalog notification wait must bypass both foreground execution slots.");
  for (const name of ["electron/core/coreCatalogChangeWatcher.ts", "core/src/Cap7CE.Core.Host/MetadataScheduling/MetadataBuildChangeDrain.cs"]) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    if (/node:(?:fs|net|http|child_process)|setInterval|setTimeout|ipcMain|ipcRenderer/.test(source)) failures.push(`${name} must retain its event-only ownership boundary.`);
  }
  const runtime = fs.readFileSync(path.join(root, "electron/computerSearchRuntime.ts"), "utf8");
  const events = fs.readFileSync(path.join(root, "electron/core/catalogSystemEvents.ts"), "utf8");
  if (/node:(?:fs|net|http|child_process)|setInterval|ipcMain|ipcRenderer/.test(events) || events.split(/\r?\n/).length > 65)
    failures.push("Catalog OS adapter must remain small and event driven without source access.");
  for (const anchor of ['power.on("resume", notify)', 'power.off("resume", notify)', 'window.unhookWindowMessage(0x0219)', 'window.once("closed", stop)'])
    if (!events.includes(anchor)) failures.push(`Catalog OS adapter is missing ${anchor}.`);
  if (runtime.indexOf("await watcher.stop();") < 0 || runtime.indexOf("await watcher.stop();") > runtime.indexOf("await metadataBuild.shutdown();"))
    failures.push("Product shutdown must retire Catalog waiting before metadata and Host shutdown.");
  const session = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/CorePipeSession.cs"), "utf8");
  if (!session.includes("CoreRequestIdentityTracker requestIds") || /requestIds\.TryAdd/.test(session)) failures.push("Core request replay tracking must remain bounded for long metadata sessions.");
};
