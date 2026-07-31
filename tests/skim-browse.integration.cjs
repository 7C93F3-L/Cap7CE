const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-browse-${process.pid}-${Date.now()}`);
app.setPath("userData", path.join(testRoot, "user-data"));

(async () => {
  try {
    const {
      buildSkimBreadcrumbs,
      parseWindowsDriveOutput,
      readSkimLocation
    } = require("../dist-electron/skimBrowseService.js");

    const folderPath = path.join(testRoot, "folder");
    const nestedFolderPath = path.join(folderPath, "nested");
    await fs.mkdir(nestedFolderPath, { recursive: true });
    await fs.writeFile(path.join(folderPath, "visible.png"), "png");
    await fs.writeFile(path.join(folderPath, "ignored.txt"), "txt");
    await fs.writeFile(path.join(nestedFolderPath, "not-recursive.jpg"), "jpg");

    const result = await readSkimLocation(folderPath);
    assert.equal(result.cancelled, false);
    assert.deepEqual(result.entries.map((entry) => [entry.kind, entry.name]), [
      ["folder", "nested"],
      ["file", "visible.png"]
    ]);
    assert.equal(result.entries.some((entry) => entry.name === "not-recursive.jpg"), false);
    assert.equal(result.breadcrumbs.at(-1).path, path.resolve(folderPath));

    const breadcrumbs = buildSkimBreadcrumbs(folderPath);
    assert.equal(breadcrumbs[0].path, path.parse(folderPath).root);
    assert.equal(breadcrumbs.at(-1).name, "folder");

    const cancelledBeforeRead = await readSkimLocation(folderPath, () => true);
    assert.equal(cancelledBeforeRead.cancelled, true);
    assert.equal(cancelledBeforeRead.entries.length, 0);

    let cancellationChecks = 0;
    const cancelledDuringProcessing = await readSkimLocation(folderPath, () => {
      cancellationChecks += 1;
      return cancellationChecks >= 4;
    });
    assert.equal(cancelledDuringProcessing.cancelled, true);

    await assert.rejects(() => readSkimLocation("relative-path"), /Invalid skim directory path/);

    const drives = parseWindowsDriveOutput(JSON.stringify([
      { root: "C:\\", label: "System" },
      { root: "c:\\", label: "Duplicate" },
      { root: "D:\\", label: "Data" },
      { root: "not-a-drive" }
    ]));
    assert.deepEqual(drives.map((drive) => drive.path.toUpperCase()), ["C:\\", "D:\\"]);
    assert.equal(drives[0].label, "System");

    console.log(JSON.stringify({
      directChildrenOnly: true,
      visualWhitelistApplied: true,
      breadcrumbsBuilt: true,
      cancellationHonored: true,
      driveOutputNormalized: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
})().then(() => {
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
