const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const native=require('../scripts/native-build-safety.cjs'),runtime=require('../scripts/metadata-runtime-safety.cjs');
(async()=>{
 const temp=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'cap7ce-owner-check-'));let child;
 const stop=async()=>{if(!child)return;const owned=child;child=undefined;if(owned.exitCode!==null||owned.signalCode)return;await new Promise(resolve=>{owned.once('exit',resolve);owned.kill();});};
 try {
  for(const [name,check] of [['Cap7CE.WinUI.exe',()=>native(root)],['node.exe',()=>runtime.assertStopped(root)]]) {
   const executable=path.join(root,name);await fs.copyFile(process.execPath,executable);
   child=spawn(executable,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('fixture exited early')));});
   assert.throws(check,/before building|in-use/,'live owners must still block artifact replacement');
   await stop();check();
  }
  console.log('Native build owner guards block live processes and accept confirmed exited owners.');
 }finally{
  await stop();assert(path.resolve(root).startsWith(path.resolve(temp)+path.sep));await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
