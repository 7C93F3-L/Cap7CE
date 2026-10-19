const assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { CoreTrashClient } = require("../dist-electron/core/coreTrashClient.js");
const { readCoreTrashResult } = require("../dist-electron/core/coreTrashProtocol.js");
const executable = path.resolve("core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = value => { const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4); header.writeInt32LE(body.length); return Buffer.concat([header, body]); };
(async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-core-trash-"));
 const client = new CoreTrashClient(executable);
 try {
  const folder = path.join(root, "父目录"), child = path.join(folder, "子文件.txt"), file = path.join(root, "独立文件.txt");
  await fs.mkdir(folder); await fs.writeFile(child, "nested disposable"); await fs.writeFile(file, "disposable");
  const item = (filePath, isDirectory = false) => ({ path: filePath, isDirectory });
  const request = { mode: "catalog", targets: [item(child), item(folder, true), item(file), item(file.toUpperCase())], cacheRoots: [] };
  const result = await client.request(request);
  assert.equal(result.success, true); assert.equal(result.totalCount, 3); assert.equal(result.deletedPaths.length, 3);
  await assert.rejects(fs.stat(folder)); await assert.rejects(fs.stat(file));
  const began = Date.now(), next = path.join(root, "下一次.txt"); await fs.writeFile(next, "next disposable");
  assert.equal((await client.request({ mode: "legacy", targets: [item(next)], cacheRoots: [] })).success, true);
  assert.ok(Date.now() - began >= 180, "separate requests retain the same Core cooldown owner");
  const protectedFile = path.join(root, "缓存.txt"); await fs.writeFile(protectedFile, "preserve cache");
  const blocked = await client.request({ mode: "catalog", targets: [item(protectedFile), item(path.parse(root).root, true), item(path.join(root, "missing"))], cacheRoots: [root] });
  assert.equal(blocked.failedItems.length, 3); assert.equal(blocked.deletedPaths.length, 0);
  assert.equal(await fs.readFile(protectedFile, "utf8"), "preserve cache");
  // The client refuses invented paths/results before a compatibility store can act on them.
  assert.throws(() => readCoreTrashResult({ requestId: 1, success: true, totalCount: 1, deletedPaths: ["C:\\unrelated.txt"], failedItems: [] }, 1,
    { mode: "legacy", targets: [item(protectedFile)], cacheRoots: [] }), /invalid-response/);
  const malformed = spawn(executable, ["--trash-session", "--parent-pid", String(process.pid)], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  const exited = new Promise(resolve => malformed.once("close", resolve)); malformed.stdout.resume();
  malformed.stdin.on("error", () => {});
  malformed.stdin.end(frame({ version: 1, requestId: 1, mode: "catalog", targets: [item(protectedFile)], cacheRoots: [], unexpected: true }));
  assert.notEqual(await exited, 0); assert.equal(await fs.readFile(protectedFile, "utf8"), "preserve cache", "malformed entire request is rejected before any operation");
  const ownerScript = path.join(root, "owner.cjs");
  await fs.writeFile(ownerScript, `const {CoreTrashClient}=require(${JSON.stringify(path.resolve("dist-electron/core/coreTrashClient.js"))});const client=new CoreTrashClient(${JSON.stringify(executable)});client.request({mode:'catalog',targets:[],cacheRoots:[]}).then(()=>console.log(client.child.pid));`);
  const owner = spawn(process.execPath, [ownerScript], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  try { const actorPid = await new Promise((resolve, reject) => {
   let output=""; const timer=setTimeout(()=>reject(Error("Core owner fixture timeout")),5000);
   owner.stdout.on("data", data=>{output+=data;if(output.includes("\n")){clearTimeout(timer);resolve(Number(output.trim()));}});
  });
  owner.kill(); await new Promise(resolve=>owner.once("exit",resolve));
  let gone=false;
  for(let i=0;i<150;i++){try{process.kill(actorPid,0);}catch(error){if(error.code==='ESRCH'){gone=true;break;}throw error;}await pause(20);}
  assert.equal(gone,true,"idle actor exits when its owning shell process is killed");
  } finally { if(owner.exitCode===null&&owner.signalCode===null)owner.kill(); }
  console.log("Native Core trash client: independent real batch/legacy recycle, shared cooldown, protected sources, strict results/requests and parent-exit cleanup passed.");
 } finally { client.close(); await pause(150); await fs.rm(root,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1});
