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
      listSkimDrives,
      parseWindowsDriveOutput,
      parseWindowsHiddenNameOutput,
      parseWindowsVolumeLabelOutput,
      readSkimLocation,
      resolveReadableSkimDirectoryPath
    } = require("../dist-electron/skimBrowseService.js");

    const folderPath = path.join(testRoot, "folder");
    const nestedFolderPath = path.join(folderPath, "nested");
    await fs.mkdir(nestedFolderPath, { recursive: true });
    await fs.writeFile(path.join(folderPath, "visible.png"), "png");
    await fs.writeFile(path.join(folderPath, "notes.txt"), "txt");
    await fs.writeFile(path.join(folderPath, "document.docx"), "docx");
    await fs.writeFile(path.join(folderPath, "sound.mp3"), "mp3");
    await fs.writeFile(path.join(folderPath, "model.obj"), "obj");
    await fs.writeFile(path.join(folderPath, "ignored.exe"), "exe");
    await fs.writeFile(path.join(folderPath, "extensionless"), "no-extension");
    await fs.writeFile(path.join(folderPath, "unknown.customext"), "unknown");
    await fs.writeFile(path.join(nestedFolderPath, "not-recursive.jpg"), "jpg");

    const result = await readSkimLocation(folderPath, () => false, [testRoot]);
    assert.equal(result.cancelled, false);
    assert.deepEqual(result.entries.map((entry) => [entry.kind, entry.name]), [
      ["folder", "nested"],
      ["file", "document.docx"],
      ["file", "extensionless"],
      ["file", "ignored.exe"],
      ["file", "model.obj"],
      ["file", "notes.txt"],
      ["file", "sound.mp3"],
      ["file", "unknown.customext"],
      ["file", "visible.png"]
    ]);
    assert.equal(result.entries.some((entry) => entry.name === "not-recursive.jpg"), false);
    assert.equal(result.breadcrumbs.at(-1).path, path.resolve(folderPath));
    assert.equal(result.entries.every((entry) => entry.withinAddedDirectory), true);
    assert.equal(result.entries.every((entry) => entry.status === "ready"), true);
    assert.equal(result.entries.find((entry) => entry.name === "nested").size, null);
    assert.equal(typeof result.entries.find((entry) => entry.name === "notes.txt").size, "number");
    assert.equal(typeof result.entries.find((entry) => entry.name === "notes.txt").modifiedAt, "string");
    assert.equal(result.entries.find((entry) => entry.name === "notes.txt").formatCapability.previewKind, "text");
    assert.equal(result.entries.find((entry) => entry.name === "visible.png").formatCapability.previewKind, "image");
    assert.equal(result.entries.find((entry) => entry.name === "ignored.exe").formatCapability, undefined);
    assert.equal(result.entries.find((entry) => entry.name === "unknown.customext").formatCapability, undefined);
    assert.equal(result.entries.find((entry) => entry.name === "extensionless").extension, "");
    assert.equal(result.entries.find((entry) => entry.name === "extensionless").formatCapability, undefined);

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
    assert.equal(await resolveReadableSkimDirectoryPath(folderPath), path.resolve(folderPath));
    assert.equal(await resolveReadableSkimDirectoryPath(path.join(folderPath, "notes.txt")), path.resolve(folderPath));
    await assert.rejects(() => resolveReadableSkimDirectoryPath("relative-path"), /Invalid skim directory path/);

    const drives = parseWindowsDriveOutput("Drives: C:\\ c:\\ D:\\ not-a-drive");
    assert.deepEqual(drives.map((drive) => drive.path.toUpperCase()), ["C:\\", "D:\\"]);

    const hiddenDirectory = "C:\\Users\\Example";
    const hiddenPaths = parseWindowsHiddenNameOutput(hiddenDirectory, "hidden.ini\r\n隐藏.txt\r\n");
    assert.equal(hiddenPaths.has(path.normalize("C:\\Users\\Example\\hidden.ini").toLocaleLowerCase()), true);
    assert.equal(hiddenPaths.has(path.normalize("C:\\Users\\Example\\隐藏.txt").toLocaleLowerCase()), true);

    const volumeLabels = parseWindowsVolumeLabelOutput([
      " Volume in drive C is Windows ",
      "驱动器 D 中的卷是 工作资料",
      "磁碟機 E 中的磁碟區是 素材",
      "Volume in drive F has no label."
    ].join("\r\n"));
    assert.deepEqual([...volumeLabels.entries()], [
      ["C", "Windows"],
      ["D", "工作资料"],
      ["E", "素材"]
    ]);

    const systemDrives = await listSkimDrives();
    assert.equal(systemDrives.some((drive) => drive.label?.includes("�")), false);

    console.log(JSON.stringify({
      directChildrenOnly: true,
      allRegularFilesVisible: true,
      knownCapabilitiesPreserved: true,
      unknownFormatsUseGenericFallback: true,
      breadcrumbsBuilt: true,
      cancellationHonored: true,
      directDirectoryPathValidated: true,
      driveOutputNormalized: true,
      volumeLabelsNormalized: true,
      hiddenAttributeOutputNormalized: true
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
