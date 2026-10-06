const fs = require("node:fs");
const path = require("node:path");

module.exports = (root, failures) => {
  const read = (name) => fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Reader.Host", name), "utf8");
  const ntfs = read("ReaderNtfsVolume.cs");
  if (!ntfs.includes("OpenNoRecall = 0x00100000, OpenReparsePoint = 0x00200000")
      || !ntfs.includes("OpenNoRecall | OpenReparsePoint | (isDirectory ? BackupSemantics : 0)"))
    failures.push("Reader basic attributes must open the original identity without reparse traversal or remote recall.");
  for (const [name, anchors] of [
    ["ReaderJournalWaitIo.cs", ["BytesToWaitFor = 1", "0x000900BB", "CancelIoEx(handle, overlapped)",
      "GetOverlappedResult(handle, overlapped, out _, true)", "await finished.Task", "64 * 1024"]],
    ["ReaderJournalWaitCoordinator.cs", ["EncodeJournalWaitRequest(request)", "await Task.WhenAll(tasks)", "lifetime.Cancel()"]],
    ["ReaderJournalWaitChannel.cs", ["TargetRequestId != request.Header.RequestId", "await waiting", "lifetime.Cancel()"]]
  ]) {
    const source = read(name);
    for (const anchor of anchors) if (!source.includes(anchor)) failures.push(`Reader journal wait ${name} is missing ${anchor}.`);
  }
};
