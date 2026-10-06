const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { registerComputerSearchChangeIpc } = require("../dist-electron/computerSearchChangeIpc.js");
const { createComputerSearchChangeBridge } = require("../dist-electron/computerSearchChangeBridge.js");
const ipc = new EventEmitter(), sent = []; ipc.send = (...args) => sent.push(args);
const bridge = createComputerSearchChangeBridge(ipc), values = [];
const callback = revision => values.push(revision);
const one = bridge.onCatalogChanged(callback), two = bridge.onCatalogChanged(callback);
assert.deepEqual(sent, [["computerSearch:watchCatalog", true]]);
for (const bad of [-1, 1.5, {}, "2", Number.MAX_SAFE_INTEGER + 1]) ipc.emit("computerSearch:catalogChanged", {}, bad);
assert.equal(values.length, 0);
ipc.emit("computerSearch:catalogChanged", {}, 3); assert.deepEqual(values, [3, 3]);
one(); one(); assert.equal(sent.length, 1); ipc.emit("computerSearch:catalogChanged", {}, 4); assert.deepEqual(values, [3, 3, 4]);
two(); assert.deepEqual(sent[1], ["computerSearch:watchCatalog", false]); assert.equal(ipc.listenerCount("computerSearch:catalogChanged"), 0);
const subscribers = new Set(); let listener, count = 0;
registerComputerSearchChangeIpc({ on(channel, selected) { assert.equal(channel, "computerSearch:watchCatalog"); listener = selected; }, handle() {} },
  event => event.allowed, { subscribeCatalogChanges(callback) { count++; subscribers.add(callback); callback(7); return () => subscribers.delete(callback); } });
class Sender extends EventEmitter {
  destroyed = false; messages = []; fail = false;
  isDestroyed() { return this.destroyed; }
  send(...args) { if (this.fail) throw Error("view-retired"); this.messages.push(args); }
}
const sender = new Sender();
listener({ allowed: false, sender }, true); listener({ allowed: true, sender }, "true"); assert.equal(count, 0);
listener({ allowed: true, sender }, true); listener({ allowed: true, sender }, true);
assert.equal(count, 1); assert.deepEqual(sender.messages, [["computerSearch:catalogChanged", 7]]);
for (const callback of subscribers) callback(8); assert.equal(sender.messages.length, 2);
listener({ allowed: true, sender }, false); assert.equal(subscribers.size, 0); assert.equal(sender.listenerCount("destroyed"), 0);
listener({ allowed: true, sender }, true); sender.destroyed = true; sender.emit("destroyed"); assert.equal(subscribers.size, 0);
const failed = new Sender(); failed.fail = true; listener({ allowed: true, sender: failed }, true);
assert.equal(subscribers.size, 0, "cached callback failure also releases the newly returned subscription");
assert.equal(failed.listenerCount("destroyed"), 0);
console.log("Catalog revision bridge reference counts, sender gate and destroyed-view cleanup passed.");
