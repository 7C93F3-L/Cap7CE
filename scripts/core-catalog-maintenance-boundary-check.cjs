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
  const timing=fs.readFileSync(path.join(directory,"CatalogMonitorTiming.cs"),"utf8");
  if(timing.trimEnd().split(/\r?\n/).length>40||/Task\.Delay|Timer|Sqlite|Exception\.Message|error\.Message|StackTrace/.test(timing)||!timing.includes('watch.ElapsedMilliseconds>=250')) failures.push("Monitor timing must stay bounded, passive, path-free and quiet for fast recurring operations.");
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
  const lane = dispatch.indexOf("request.Operation is CoreOperations.CatalogAwaitChanges or CoreOperations.CatalogAwaitScopedChanges && runtime?.MaintenanceEnabled == true");
  if (lane < 0 || lane > dispatch.indexOf("await executionSlots.WaitAsync")) failures.push("Catalog notification wait must bypass both foreground execution slots.");
  const drain = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/MetadataScheduling/MetadataBuildChangeDrain.cs"), "utf8");
  const subscription = fs.readFileSync(path.join(root, "shell/Cap7CE.WinUI/Services/CatalogChangeSubscription.cs"), "utf8");
  if (/File\.|Directory\.|Task\.Delay|PeriodicTimer/.test(drain + subscription)) failures.push("Catalog change waits must remain event-only without polling or source IO.");
  for (const anchor of ["CatalogAwaitScopedChanges", "stop.Token", "stop.Cancel()"])
    if (!subscription.includes(anchor)) failures.push(`Native Catalog subscription is missing ${anchor}.`);
  const session = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host/CorePipeSession.cs"), "utf8");
  if (!session.includes("CoreRequestIdentityTracker requestIds") || /requestIds\.TryAdd/.test(session)) failures.push("Core request replay tracking must remain bounded for long metadata sessions.");
};
