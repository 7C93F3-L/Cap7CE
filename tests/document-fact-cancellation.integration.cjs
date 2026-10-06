const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const file = path.resolve(__dirname, '../dist-electron/documentFactInspector.js');
const loaded = { exports: {} }, workers = [];
class FakeWorker extends EventEmitter {
  constructor(file, options) { super(); this.options = options; this.threadId = 1; this.terminated = 0; this.messages = []; workers.push(this); }
  unref() { this.unreferenced = true; }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated++; return new Promise(resolve => { this.release = resolve; }); }
}
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  exports: loaded.exports, __dirname: path.dirname(file), Buffer, setTimeout, clearTimeout, Promise,
  require(name) {
    if (name === 'node:worker_threads') return { Worker: FakeWorker };
    if (name === 'node:path') return path;
    return require(path.resolve(path.dirname(file), name));
  }
}, { filename: file });
const inspect = loaded.exports.inspectDocumentFactBatch;
const source = [{ filePath: 'C:\\generated\\test.pdf', sourceRevision: 'exact' }];
const tick = () => new Promise(setImmediate);
(async () => {
  const before = new AbortController(); before.abort();
  assert.equal((await inspect(source, 100, before.signal))[0].errorCode, 'document-fact-cancelled');
  assert.equal(workers.length, 0, 'pre-cancellation cannot start source access');
  const active = new AbortController(); let settled = false;
  const pending = inspect(source, 100, active.signal).then(result => { settled = true; return result; });
  assert.equal(workers[0].options.resourceLimits.maxOldGenerationSizeMb, 256);
  assert.equal(workers[0].unreferenced, undefined, 'Core parser stays owned until completion');
  assert.equal(workers[0].messages.length, 1); active.abort(); await tick();
  assert.equal(settled, false); assert.equal(workers[0].terminated, 1); workers[0].release(0);
  assert.equal((await pending)[0].errorCode, 'document-fact-cancelled');
  const cleanExit = inspect(source, 100); workers[1].emit('exit', 0); workers[1].release(0);
  assert.equal((await cleanExit)[0].errorCode, 'document-content-count-worker-exited');
  const timed = inspect(source, 10, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(workers[2].terminated, 1); workers[2].release(0);
  assert.equal((await timed)[0].errorCode, 'document-content-count-timeout');
  const successSignal = new AbortController(), success = inspect(source, 100, successSignal.signal);
  workers[3].emit('message', { id: 1, result: { status: 'indexed', contentCount: 3, sourceRevision: 'exact' } });
  successSignal.abort(); assert.equal(workers[3].terminated, 1); workers[3].release(0);
  assert.equal((await success)[0].contentCount, 3);
  console.log('Document cancellation, timeout and empty exit retire the bounded parser before advancing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
