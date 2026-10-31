const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const file=path.resolve(__dirname,'../core/artifacts/file-facts/core/node/fileFacts/domain/fontFactInspector.js'),loaded={exports:{}},workers=[];
let stats=0;
class FakeWorker extends EventEmitter {
 constructor(file,options){super();this.options=options;this.threadId=1;this.terminated=0;workers.push(this)}
 terminate(){this.terminated++;return new Promise(resolve=>{this.release=resolve})}
}
vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:loaded.exports,__dirname:path.dirname(file),Buffer,setTimeout,clearTimeout,Promise,require(name){
 if(name==='node:fs/promises')return {lstat:async()=>{stats++;return {isFile:()=>true,isSymbolicLink:()=>false,size:100}}};
 if(name==='node:worker_threads')return {Worker:FakeWorker};
 if(name==='node:path')return path;
 return require(path.resolve(path.dirname(file),name));
}},{filename:file});
const inspect=loaded.exports.inspectFontFactBatch,source=[{filePath:'C:\\generated\\test.ttf',sourceRevision:'exact'}];
(async()=>{
 const before=new AbortController();before.abort();assert.equal((await inspect(source,100,before.signal))[0].errorCode,'font-fact-cancelled');assert.equal(stats,0);
 const active=new AbortController();let settled=false;const pending=inspect(source,100,active.signal).then(result=>{settled=true;return result});await new Promise(setImmediate);
 assert.equal(workers.length,1);assert.equal(workers[0].options.resourceLimits.maxOldGenerationSizeMb,128);active.abort();await Promise.resolve();
 assert.equal(settled,false,'cancellation waits for worker to retire');assert.equal(workers[0].terminated,1);workers[0].release(0);
 assert.equal((await pending)[0].errorCode,'font-fact-cancelled');
 const cleanExit=inspect(source,100);await new Promise(setImmediate);workers[1].emit('exit',0);workers[1].release(0);assert.equal((await cleanExit)[0].errorCode,'font-fact-worker-failed');
 console.log('Font cancellation waits for its bounded parser worker to exit without reading source content.');
})().catch(error=>{console.error(error);process.exitCode=1});
