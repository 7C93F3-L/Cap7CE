const path = require('node:path'), { spawn } = require('node:child_process');
const { VisualCacheFrameReader } = require('./load-canonical.cjs')('core/node/visualCache/contracts/visualCacheFrames.ts');
module.exports = (directory, entry, profile) => {
  require('node:fs').mkdirSync(profile, { recursive: true });
  const child = spawn(path.join(directory, 'node.exe'), [path.join(directory, entry), profile], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { SystemRoot: process.env.SystemRoot, TEMP: profile, TMP: profile, PATH: '', NODE_OPTIONS: '', NODE_PATH: '' }
  });
  let sequence = 0; const pending = new Map();
  const fail = error => { for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); } pending.clear(); };
  const reader = new VisualCacheFrameReader(bytes => {
    const value = JSON.parse(bytes); const job = pending.get(value.id);
    if (!job) throw Error('Unexpected native response'); pending.delete(value.id); clearTimeout(job.timer);
    if (value.error) job.reject(Object.assign(Error(value.error.message), { code: value.error.code })); else job.resolve(value.result);
  });
  child.stderr.resume(); child.stdout.on('data', bytes => { try { reader.push(bytes); } catch (error) { fail(error); child.kill(); } });
  child.on('error', fail); child.on('exit', () => fail(Error('Native session exited')));
  return {
    request(method, args) {
      const id = ++sequence, payload = Buffer.from(JSON.stringify({ version: 1, id, method, args })), header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('Native request timed out')); child.kill(); }, 15000);
        pending.set(id, { resolve, reject, timer }); child.stdin.write(Buffer.concat([header, payload]));
      });
    },
    async close() {
      if (child.exitCode !== null || child.signalCode) return;
      await new Promise((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(Error('Native session did not release')); }, 4000);
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Native session failed: ' + code)); }); child.stdin.end(); });
    }
  };
};
