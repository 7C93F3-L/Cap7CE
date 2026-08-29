const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/renderer/search/Cap7CESearchCapsule.tsx"),
  "utf8"
);

assert.match(
  source,
  /if \(userClearedQuery && onSearchOptionsChange\) \{\s*onSearchOptionsChange\(\{ \.\.\.nextSearch, query: "" \}\);\s*\}/u,
  "clearing a non-empty search query must refresh the default grid immediately"
);
assert.doesNotMatch(source, /queryClearSearchTimerRef|clearQueryClearSearchTimer/u);

console.log("search capsule interaction integration passed");
