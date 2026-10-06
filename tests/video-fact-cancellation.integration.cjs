const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

// Exercise lifecycle without opening media or starting Windows Shell.
const children = [];
const moduleUnderTest = { exports: {} };
const inspectorPath = path.resolve(__dirname, "../dist-electron/videoFactInspector.js");
vm.runInNewContext(fs.readFileSync(inspectorPath, "utf8"), {
  exports: moduleUnderTest.exports,
  process: { platform: "win32" }, Buffer, setTimeout, clearTimeout,
  require(name) {
    if (name === "node:child_process") return { spawn(executable, args, options) {
      assert.equal(options.windowsHide, true);
      assert.equal(options.shell, undefined);
      assert.ok(args.includes("-NonInteractive"));
      const child = new EventEmitter();
      child.stdin = new PassThrough(); child.stdout = new PassThrough();
      child.kills = 0; child.kill = () => { child.kills += 1; return true; };
      children.push(child);
      return child;
    } };
    return require(path.resolve(path.dirname(inspectorPath), name));
  }
}, { filename: inspectorPath });

const { inspectVideoFactBatch } = moduleUnderTest.exports;
const candidates = [{ filePath: "C:\\generated\\sample.mp4", sourceRevision: "exact-source" }];
const failure = (results, code) => {
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceRevision, "exact-source");
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].errorCode, code);
};

(async () => {
  const beforeStart = new AbortController(); beforeStart.abort();
  failure(await inspectVideoFactBatch(candidates, 100, beforeStart.signal), "video-properties-cancelled");
  assert.equal(children.length, 0);

  const active = new AbortController();
  const cancelled = inspectVideoFactBatch(candidates, 100, active.signal);
  active.abort();
  failure(await cancelled, "video-properties-cancelled");
  assert.equal(children[0].kills, 1);
  children[0].emit("close", 0);
  children[0].stdin.emit("error", new Error("late closed pipe"));
  assert.equal(children[0].kills, 1, "late events must not cancel an already settled task again");

  const afterSuccess = new AbortController();
  const completed = inspectVideoFactBatch(candidates, 100, afterSuccess.signal);
  children[1].stdout.write('[{"id":0,"durationMs":1200,"width":1920,"height":1080}]');
  children[1].emit("close", 0);
  assert.equal((await completed)[0].status, "indexed");
  afterSuccess.abort();
  assert.equal(children[1].kills, 0, "successful extraction removes its abort listener");

  const timedOut = inspectVideoFactBatch(candidates, 5);
  const keepAlive = setTimeout(() => {}, 30);
  failure(await timedOut, "video-properties-timeout");
  clearTimeout(keepAlive);
  assert.equal(children[2].kills, 1);

  const brokenPipe = inspectVideoFactBatch(candidates, 100);
  children[3].stdin.emit("error", new Error("closed pipe"));
  failure(await brokenPipe, "video-properties-process-failed");
  assert.equal(children[3].kills, 1);
  console.log("Video fact cancellation lifecycle tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
