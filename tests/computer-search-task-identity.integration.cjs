const assert = require("node:assert/strict");
const { createComputerSearchTaskIdGenerator } = require("../src/renderer/computer-search/computerSearchTaskIdentity.ts");
const first = createComputerSearchTaskIdGenerator(() => "00000000-0000-4000-8000-000000000001");
const second = createComputerSearchTaskIdGenerator(() => "00000000-0000-4000-8000-000000000002");
const ids = new Set();
for (let index = 0; index < 10000; index++) {
  for (const next of [first, second]) {
    const id = next(index % 2 ? "refresh" : "search");
    assert.match(id, /^[A-Za-z0-9_-]{1,128}$/);
    assert(!ids.has(id), "Owners, submissions and repeated replacements cannot share an authorization session");
    ids.add(id);
  }
}
assert.throws(() => createComputerSearchTaskIdGenerator(() => "bad owner"), /invalid-search-owner/);
assert.notEqual(createComputerSearchTaskIdGenerator()("search"), createComputerSearchTaskIdGenerator()("search"));
console.log("Independent search owners and repeated replacement task identities passed.");
