const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitGone = async pid => { for (let attempt=0; attempt<100 && alive(pid); attempt++) await sleep(50); assert.equal(alive(pid), false, `process ${pid} retired`); };
const waitJson = async file => { for (let attempt=0; attempt<100; attempt++) { try { return JSON.parse(await fs.readFile(file,'utf8')); } catch { await sleep(50); } } throw Error('fixture startup timeout'); };
const processes = [];
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-core-visuals-'));
  try {
    const runtime = path.join(root, '独立 运行时'); await fs.mkdir(runtime);
    const executable = path.join(runtime, 'Cap7CE.Core.Visuals.exe'), node = path.join(runtime, 'node.exe');
    await fs.copyFile(path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe'), executable);
    await fs.copyFile(path.resolve('artifacts/metadata-worker/v1/node.exe'), node);
    const binary=await fs.readFile(executable),optional=binary.readUInt32LE(0x3c)+24;
    assert.equal(binary.readUInt16LE(optional),0x20b,'x64 PE');
    assert.equal(binary.readBigUInt64LE(optional+112+14*8),0n,'no CLR descriptor');
    assert.ok(/requestedExecutionLevel[^>]*level=['"]asInvoker['"]/.test(binary.toString('latin1')),'embedded ordinary-privilege manifest');
    const env = { SystemRoot: process.env.SystemRoot, TEMP: root, TMP: root, PATH: '' };
    assert.deepEqual(JSON.parse(execFileSync(executable, ['--describe'], { env, windowsHide: true, encoding:'utf8' })), { protocol:'core-visuals/1',runtimeRequired:false });
    const launch = (exe, args, options={}) => { const child = spawn(exe,args,{env,windowsHide:true,stdio:['pipe','ignore','ignore'],...options}); processes.push(child); return child; };
    const worker = path.join(runtime, 'worker with space.cjs');
    await fs.writeFile(worker, `const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=process.argv[2], grand=cp.spawn(process.execPath,['-e','setInterval(()=>{},10000)'],{stdio:'ignore',windowsHide:true});
fs.writeFileSync(path.join(root,'pids.json'),JSON.stringify({worker:process.pid,grandchild:grand.pid,argument:root}));
if(fs.existsSync(path.join(root,'exit-worker')))setTimeout(()=>process.exit(0),150);else setInterval(()=>{},10000);`);
    // Closing the supervisor's job kills Node and descendants, even with ignored standard streams.
    const first = path.join(root,'job'); await fs.mkdir(first);
    const owner = launch(executable,['--node-worker','--parent-pid',String(process.pid),node,worker,first+path.sep]);
    const pids = await waitJson(path.join(first,'pids.json')); assert.equal(pids.argument,first+path.sep);
    assert.ok(alive(pids.worker)); assert.ok(alive(pids.grandchild));
    assert.throws(()=>require('../scripts/core-visuals-safety.cjs').assertStopped(runtime),/core-visuals-in-use/);
    owner.kill(); await Promise.all([waitGone(pids.worker),waitGone(pids.grandchild)]);
    // Worker exit must clean an otherwise living grandchild as well.
    const normal = path.join(root,'normal');await fs.mkdir(normal);await fs.writeFile(path.join(normal,'exit-worker'),'yes');
    const completed = launch(executable,['--node-worker','--parent-pid',String(process.pid),node,worker,normal]);
    const completedExit = new Promise(resolve=>completed.once('close',resolve)), normalPids=await waitJson(path.join(normal,'pids.json'));
    assert.equal(await completedExit,0);await waitGone(normalPids.grandchild);
    // A killed Shell parent, with live pipe handles in its children, still tears down the entire tree.
    const interrupted = path.join(root,'parent-exit');await fs.mkdir(interrupted);
    const launcher = path.join(runtime,'launcher.cjs');
    await fs.writeFile(launcher, `const cp=require('child_process'),fs=require('fs'),path=require('path');
const child=cp.spawn(${JSON.stringify(executable)},['--node-worker','--parent-pid',String(process.pid),${JSON.stringify(node)},${JSON.stringify(worker)},${JSON.stringify(interrupted)}],{stdio:['pipe','ignore','ignore'],windowsHide:true});
fs.writeFileSync(${JSON.stringify(path.join(interrupted,'owner.json'))},JSON.stringify({owner:child.pid}));setInterval(()=>{},10000);`);
    const parent=launch(node,[launcher]);const ownerPid=(await waitJson(path.join(interrupted,'owner.json'))).owner;
    const interruptedPids=await waitJson(path.join(interrupted,'pids.json'));parent.kill();
    await Promise.all([waitGone(ownerPid),waitGone(interruptedPids.worker),waitGone(interruptedPids.grandchild)]);
    // The one-shot thumbnail mode also observes its parent while waiting for an input frame.
    const thumbnailLauncher=path.join(runtime,'thumbnail-parent.cjs'),thumbnailPidFile=path.join(root,'thumbnail-owner.json');
    await fs.writeFile(thumbnailLauncher,`const c=require('child_process').spawn(${JSON.stringify(executable)},['--thumbnail','--parent-pid',String(process.pid)],{stdio:['pipe','ignore','ignore'],windowsHide:true});require('fs').writeFileSync(${JSON.stringify(thumbnailPidFile)},JSON.stringify({pid:c.pid}));setInterval(()=>{},10000);`);
    const thumbnailParent=launch(node,[thumbnailLauncher]),thumbnailPid=(await waitJson(thumbnailPidFile)).pid;
    assert.ok(alive(thumbnailPid));thumbnailParent.kill();await waitGone(thumbnailPid);
    // Malformed input cannot ask the native thumbnail backend to parse a source path.
    const invalid=launch(executable,['--thumbnail','--parent-pid',String(process.pid)]),invalidExit=new Promise(resolve=>invalid.once('close',resolve));
    invalid.stdin.end(Buffer.from([255,255,255,127]));assert.equal(await invalidExit,2);
    console.log('Core native visuals: standalone as-invoker host, quoted Unicode arguments, suspended job assignment, normal/killed-owner descendant cleanup, blocked-input parent exit and malformed frame rejection passed.');
  } finally {
    for (const child of processes) child.kill(); await sleep(150);
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-core-visuals-'));
    await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
