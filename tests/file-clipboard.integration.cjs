const assert = require("node:assert/strict");
const path = require("node:path");

const {
  formatFilePathsForClipboard,
  normalizeFilePathsForClipboard
} = require("../dist-electron/fileClipboardService.js");

const firstPath = path.resolve("C:\\Samples\\first.png");
const secondPath = path.resolve("C:\\Samples\\second.txt");

assert.deepEqual(
  normalizeFilePathsForClipboard([firstPath, firstPath.toUpperCase(), "relative.txt", secondPath], "win32"),
  [firstPath, secondPath]
);
assert.equal(
  formatFilePathsForClipboard([firstPath, secondPath]),
  `${firstPath}\r\n${secondPath}`
);
assert.deepEqual(normalizeFilePathsForClipboard("not-an-array"), []);

console.log(JSON.stringify({
  absolutePathsOnly: true,
  windowsDuplicatesRemoved: true,
  multiSelectionUsesCrlf: true
}));
