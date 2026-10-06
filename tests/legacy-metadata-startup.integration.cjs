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
const main = { isDestroyed: () => false, send: (...args) => sent.push(["main", ...args]) };
const settings = { isDestroyed: () => false, send: (...args) => sent.push(["settings", ...args]) };
exportsObject.configureEmbeddedMetadataRuntime({}, () => main, () => settings);
assert.deepEqual(sourceWork, [], "Runtime wiring must not rediscover old facts or produce video thumbnails");
assert.equal(notificationOwner(), main);
assert.equal(registration.isSenderAllowed({ sender: main }), true);
assert.equal(registration.isSenderAllowed({ sender: settings }), true);
assert.equal(registration.isSenderAllowed({ sender: {} }), false);
assert.equal(registration.getStatus(), status);
statusListener(status);
assert.deepEqual(sent, [["main", "embeddedMetadata:statusChanged", status], ["settings", "embeddedMetadata:statusChanged", status]]);
assert.deepEqual(sourceWork, [], "Readonly status and event subscriptions cannot start legacy source work");
console.log("Legacy metadata startup is readonly and cannot enqueue old extraction or thumbnail production.");
