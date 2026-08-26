const assert = require("node:assert/strict");
const { createLlamaRuntimeIdleController } = require("../dist-electron/llamaRuntimeIdleController.js");

const scheduled = [];
let idleStops = 0;
const controller = createLlamaRuntimeIdleController({
  idleTimeoutMs: 10 * 60_000,
  onIdle: () => { idleStops += 1; },
  schedule: (callback, delayMs) => {
    const timer = { callback, delayMs, cancelled: false, unrefCalled: false, unref() { this.unrefCalled = true; } };
    scheduled.push(timer);
    return timer;
  },
  cancel: (timer) => { timer.cancelled = true; }
});

controller.markStartRequested("ai");
controller.beginAiUse();
controller.beginAiUse();
controller.endAiUse();
assert.equal(scheduled.length, 0, "nested AI use must keep the runtime active");
controller.endAiUse();
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].delayMs, 10 * 60_000);
assert.equal(scheduled[0].unrefCalled, true);

controller.beginAiUse();
assert.equal(scheduled[0].cancelled, true, "new AI work must cancel pending idle stop");
controller.endAiUse();
assert.equal(scheduled.length, 2);
scheduled[1].callback();
assert.equal(idleStops, 1);

controller.markStopped();
controller.markStartRequested("manual");
controller.beginAiUse();
controller.endAiUse();
assert.equal(scheduled.length, 2, "manually started runtime must not be stopped by AI idle policy");

controller.markStopped();
assert.deepEqual(controller.getSnapshot(), {
  owner: "none",
  activeAiUseCount: 0,
  idleStopScheduled: false
});

console.log(JSON.stringify({
  aiIdleStopScheduledForTenMinutes: true,
  newAiUseCancelsIdleStop: true,
  nestedAiUseProtected: true,
  manualRuntimeExempt: true
}));
