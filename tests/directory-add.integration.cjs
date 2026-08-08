const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-directory-add-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");

app.setPath("userData", userDataPath);

const createFile = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "test");
};

const hasOverlappingDirectories = (directories) => directories.some((left, index) => (
  directories.some((right, rightIndex) => {
    if (index === rightIndex) return false;
    const relativePath = path.relative(left.path.toLowerCase(), right.path.toLowerCase());
    return relativePath === "" || (
      relativePath !== ".."
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath)
    );
  })
));

(async () => {
  try {
    const { addDirectoryCandidates } = require("../dist-electron/directoryAddService.js");
    const {
      getExistingImageCountsByDirectory,
      reassignDirectoryImages,
      writeScannedImagesToIndex
    } = require("../dist-electron/sqliteImageIndex.js");

    const firstDirectory = path.join(testRoot, "first");
    const firstFile = path.join(firstDirectory, "one.png");
    const secondFile = path.join(firstDirectory, "two.jpg");
    await createFile(firstFile);
    await createFile(secondFile);

    const converted = await addDirectoryCandidates({
      candidates: [firstDirectory, firstFile, secondFile]
    });
    assert.equal(converted.added.length, 1);
    assert.equal(converted.ignored.filter((item) => item.reason === "duplicate-candidate").length, 2);
    assert.equal(converted.added[0].path, path.resolve(firstDirectory));

    const childDirectory = path.join(firstDirectory, "child");
    await fs.mkdir(childDirectory, { recursive: true });
    const covered = await addDirectoryCandidates({ candidates: [childDirectory] });
    assert.equal(covered.added.length, 0);
    assert.equal(covered.ignored[0].reason, "covered-by-existing");
    assert.equal(covered.ignored[0].existingDirectory.id, converted.added[0].id);

    const secondDirectory = path.join(testRoot, "second");
    await fs.mkdir(secondDirectory, { recursive: true });
    const partial = await addDirectoryCandidates({
      candidates: [path.join(testRoot, "missing"), secondDirectory]
    });
    assert.equal(partial.added.length, 1);
    assert.equal(partial.failures.length, 1);
    assert.equal(partial.failures[0].reason, "not-found");

    const batchParent = path.join(testRoot, "batch-parent");
    const batchChild = path.join(batchParent, "child");
    await fs.mkdir(batchChild, { recursive: true });
    const collapsed = await addDirectoryCandidates({ candidates: [batchChild, batchParent] });
    assert.equal(collapsed.added.length, 1);
    assert.equal(collapsed.added[0].path, path.resolve(batchParent));
    assert.equal(collapsed.ignored[0].reason, "covered-by-candidate");

    const driveRootIgnored = await addDirectoryCandidates({ candidates: [path.parse(testRoot).root] });
    assert.equal(driveRootIgnored.added.length, 0);
    assert.equal(driveRootIgnored.ignored[0].reason, "drive-root");

    const conflictParent = path.join(testRoot, "conflict-parent");
    const conflictChildOne = path.join(conflictParent, "one");
    const conflictChildTwo = path.join(conflictParent, "two");
    const conflictFileOne = path.join(conflictChildOne, "one.png");
    const conflictFileTwo = path.join(conflictChildTwo, "two.png");
    await createFile(conflictFileOne);
    await createFile(conflictFileTwo);
    const childAdd = await addDirectoryCandidates({ candidates: [conflictChildOne, conflictChildTwo] });
    assert.equal(childAdd.added.length, 2);

    const indexedAt = new Date().toISOString();
    const childByPath = new Map(childAdd.added.map((directory) => [directory.path, directory]));
    await writeScannedImagesToIndex(
      childAdd.added.map((directory) => directory.id),
      [
        {
          directory_id: childByPath.get(path.resolve(conflictChildOne)).id,
          directory_path: path.resolve(conflictChildOne),
          file_path: path.resolve(conflictFileOne),
          file_name: path.basename(conflictFileOne),
          file_size: 4,
          created_at: indexedAt,
          modified_at: indexedAt,
          modified_ms: Date.now()
        },
        {
          directory_id: childByPath.get(path.resolve(conflictChildTwo)).id,
          directory_path: path.resolve(conflictChildTwo),
          file_path: path.resolve(conflictFileTwo),
          file_name: path.basename(conflictFileTwo),
          file_size: 4,
          created_at: indexedAt,
          modified_at: indexedAt,
          modified_ms: Date.now()
        }
      ],
      indexedAt
    );

    const conflict = await addDirectoryCandidates({ candidates: [conflictParent] });
    assert.equal(conflict.added.length, 0);
    assert.equal(conflict.conflicts.length, 1);
    assert.equal(conflict.conflicts[0].existingDirectories.length, 2);

    const replacement = await addDirectoryCandidates({
      candidates: [conflictParent],
      conflictResolution: "replace-existing"
    });
    assert.equal(replacement.added.length, 1);
    assert.equal(replacement.replacements.length, 1);
    assert.equal(replacement.replacements[0].replacedDirectories.length, 2);
    assert.equal(hasOverlappingDirectories(replacement.directories), false);

    await reassignDirectoryImages(replacement.replacements.map((item) => ({
      fromDirectoryIds: item.replacedDirectories.map((directory) => directory.id),
      toDirectoryId: item.directory.id,
      toDirectoryPath: item.directory.path
    })));
    const replacementCounts = await getExistingImageCountsByDirectory([replacement.added[0].id]);
    assert.equal(replacementCounts[replacement.added[0].id], 2);

    const duplicate = await addDirectoryCandidates({ candidates: [conflictParent] });
    assert.equal(duplicate.added.length, 0);
    assert.equal(duplicate.ignored[0].reason, "already-added");

    console.log(JSON.stringify({
      fileCandidatesConverted: true,
      duplicateCandidatesRemoved: true,
      driveRootIgnored: true,
      parentChildCoverageDetected: true,
      partialFailuresIsolated: true,
      replacementConflictConfirmed: true,
      existingIndexReassigned: true
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
