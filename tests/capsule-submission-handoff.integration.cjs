const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { CapsuleSubmissionHandoff } = require(path.join(root, "dist-electron", "capsuleSubmissionHandoff.js"));
const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));

const main = async () => {
  const events = [];
  const dispatched = [];
  let activateCount = 0;
  const handoff = new CapsuleSubmissionHandoff({
    activateNormal: () => { activateCount += 1; events.push("activate"); return true; },
    canActivate: () => true,
    dispatchQuery: (query) => { events.push("dispatch"); dispatched.push(query); }
  });

  handoff.submit("first");
  handoff.submit("second");
  assert.equal(activateCount, 0, "submission must not hide the capsule inside its IPC call stack");
  await flushImmediate();
  assert.equal(activateCount, 1, "only the latest queued submission should activate normal");
  assert.deepEqual(dispatched, ["second"]);
  assert.deepEqual(events, ["activate", "dispatch"], "normal host must be restored before the query is dispatched");

  handoff.submit("cancelled");
  handoff.cancel();
  await flushImmediate();
  assert.deepEqual(dispatched, ["second"], "cancelled handoffs must not dispatch a query");

  console.log(JSON.stringify({
    submitReturnsBeforeWindowActivation: true,
    staleSubmissionSuppressed: true,
    hostActivatedBeforeQueryDispatch: true,
    cancelledSubmissionSuppressed: true
  }));
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
