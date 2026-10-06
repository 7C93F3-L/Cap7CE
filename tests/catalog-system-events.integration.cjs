const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { installCatalogSystemEvents } = require("../dist-electron/core/catalogSystemEvents.js");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const power = new EventEmitter(), window = new EventEmitter();
  let hook, unhooks = 0, calls = 0, active = 0, maximum = 0, release;
  window.hookWindowMessage = (message, callback) => { assert.equal(message, 0x0219); hook = callback; };
  window.unhookWindowMessage = message => { assert.equal(message, 0x0219); unhooks++; };
  window.isDestroyed = () => false;
  const stop = installCatalogSystemEvents(window, power, async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    try { if (calls === 1) await new Promise(resolve => { release = resolve; }); }
    finally { active--; }
  }, "win32");
  const device = value => { const buffer = Buffer.alloc(8); buffer.writeUInt32LE(value); hook(buffer); };
  hook(Buffer.alloc(0)); device(0x8001); await delay(400); assert.equal(calls, 0);
  power.emit("resume"); device(0x8000); device(0x0007); await delay(400);
  assert.equal(calls, 1, "resume/device burst shares one refresh");
  device(0x8004); await delay(400); assert.equal(calls, 1, "refreshes never overlap");
  release(); await delay(20); assert.equal(calls, 2, "an event during refresh receives a trailing refresh");
  assert.equal(maximum, 1);
  device(0x8000); window.emit("closed"); await delay(400); assert.equal(calls, 2);
  assert.equal(power.listenerCount("resume"), 0); assert.equal(unhooks, 1); stop(); assert.equal(unhooks, 1);
  const second = new EventEmitter(); Object.assign(second, { isDestroyed: () => false, hookWindowMessage: () => { throw Error("non-Windows hook"); }, unhookWindowMessage: () => { throw Error("non-Windows unhook"); } });
  let failures = 0;
  const stopSecond = installCatalogSystemEvents(second, power, async () => { failures++; throw Error("offline"); }, "linux");
  power.emit("resume"); await delay(800); assert.equal(failures, 1, "failure does not create a retry timer");
  power.emit("resume"); await delay(400); assert.equal(failures, 2, "a new OS event may retry"); stopSecond();
  console.log("Catalog OS events coalesce, serialize, retire listeners, and never poll or retry without an event.");
})().catch(error => { console.error(error); process.exitCode = 1; });
