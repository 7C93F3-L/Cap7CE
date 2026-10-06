const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const file=path.resolve(__dirname,'../dist-electron/audioFactInspector.js'),loaded={exports:{}},children=[];
vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:loaded.exports,process:{platform:'win32'},Buffer,setTimeout,clearTimeout,require(name){
 if(name==='node:child_process')return {spawn(executable,args,options){
  assert.equal(options.windowsHide,true);assert.ok(args.includes('-NonInteractive'));
  const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kills=0;child.kill=()=>{child.kills++;return true};children.push(child);return child;
 }};
 return require(path.resolve(path.dirname(file),name));
}},{filename:file});
const inspect=loaded.exports.inspectAudioFactBatch,source=[{filePath:'C:\\generated\\test.wav',sourceRevision:'source-guarded'}];
async function check(promise,code){const [result]=await promise;assert.equal(result.sourceRevision,'source-guarded');assert.equal(result.status,'failed');assert.equal(result.errorCode,code)}
(async()=>{
 const before=new AbortController();before.abort();await check(inspect(source,100,before.signal),'audio-properties-cancelled');assert.equal(children.length,0);
 const active=new AbortController(),cancelled=inspect(source,100,active.signal);active.abort();await check(cancelled,'audio-properties-cancelled');assert.equal(children[0].kills,1);
 children[0].stdin.emit('error',new Error('late pipe'));children[0].emit('close',0);assert.equal(children[0].kills,1);
 const after=new AbortController(),success=inspect(source,100,after.signal);children[1].stdout.write('[{"id":0,"durationMs":1200,"channelCount":2}]');children[1].emit('close',0);
 assert.equal((await success)[0].status,'indexed');after.abort();assert.equal(children[1].kills,0);
 const pipe=inspect(source,100);children[2].stdin.emit('error',new Error('pipe'));await check(pipe,'audio-properties-process-failed');assert.equal(children[2].kills,1);
 const overflow=inspect(source,100);children[3].stdout.write('x'.repeat(256*1024+1));await check(overflow,'audio-properties-invalid-response');assert.equal(children[3].kills,1);
 const timeout=inspect(source,5),alive=setTimeout(()=>{},30);await check(timeout,'audio-properties-timeout');clearTimeout(alive);assert.equal(children[4].kills,1);
 console.log('Audio cancellation, pipe failure and bounded output passed without source reads.');
})().catch(error=>{console.error(error);process.exitCode=1});
