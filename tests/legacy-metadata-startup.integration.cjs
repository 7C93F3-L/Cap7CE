const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../dist-electron/embeddedMetadataRuntime.js"), "utf8");
const sourceWork = [], sent = [];
let registration, statusListener, notificationOwner;
const performSourceWork = (...args) => { sourceWork.push(args); throw new Error("Unexpected startup source work"); };
const status = { phase: "idle" };
const service = { status: () => status, startBackfill: performSourceWork, cancel: async () => true,
  onStatusChanged: callback => { statusListener = callback; }, enqueueDirectories: performSourceWork };
const exportsObject = {};
vm.runInNewContext(source, { exports: exportsObject, require: name => {
  if (name === "./embeddedMetadataService") return { createEmbeddedMetadataService: () => service };
  if (name === "./embeddedMetadataIpc") return { registerEmbeddedMetadataIpc: value => { registration = value; } };
  if (name === "./searchIndexChangeRuntime") return {
    configureSearchIndexChangeRuntime: owner => { notificationOwner = owner; }, notifySearchIndexChanged: () => {} };
  if (name === "./sqliteImageIndex" || /^\.\/(?:imageDimension|animationFact|videoFact|videoColor|audioFact|documentFact|textDataFact|threeDFact|archiveFact|fontFact|modelFact)Runtime$/.test(name))
    return new Proxy({}, { get: () => performSourceWork });
  throw new Error(`Unexpected runtime dependency ${name}`);
}, console });
assert.deepEqual(sourceWork, [], "Importing compatibility metadata services must not start source work");
assert.equal(exportsObject.configureEmbeddedMetadataRuntime,undefined,"Retired bulk metadata IPC must not be wired");
assert.equal(registration,undefined);assert.equal(statusListener,undefined);
assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../electron/preload.ts'),'utf8'),/embeddedMetadata:startBackfill/);
console.log("Legacy metadata startup stays dormant; bulk maintenance IPC is retired.");
