const assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const {CoreNodeRpcSession}=require('../dist-electron/core/coreNodeRpcSession.js');
const {VisualCacheFrameReader}=require('../dist-electron/core/visualCacheFrames.js');
const frame=value=>{const bytes=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);return Buffer.concat([header,bytes])};
function create(){
 const received=[],child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),referenced:false,ref(){this.referenced=true},unref(){this.referenced=false}};
 const reader=new VisualCacheFrameReader(bytes=>received.push(JSON.parse(bytes)));child.stdin.on('data',bytes=>reader.push(bytes));
 let sequence=0,fatal=0;const session=new CoreNodeRpcSession(child,()=>++sequence,()=>fatal++);
 return{child,session,received,get fatal(){return fatal},close(){session.close();for(const stream of[child.stdin,child.stdout,child.stderr])stream.destroy()}};
}
(async()=>{
 const peers=[];const open=()=>{const peer=create();peers.push(peer);return peer};
 try{
  const peer=open(),tasks=Array.from({length:64},(_,i)=>peer.session.request('fixture-'+i,['中文',i]));
  assert.equal(peer.received.length,64);assert.equal(peer.child.referenced,true);assert.throws(()=>peer.session.request('overflow',[]),/unavailable/);
  for(const value of [...peer.received].reverse()){
   assert.deepEqual([value.version,value.method,value.args],[1,'fixture-'+(value.id-1),['中文',value.id-1]]);
   const reply=frame({id:value.id,result:'回复-'+value.id});for(const byte of reply)peer.child.stdout.write(Buffer.from([byte]));
   if(value.id!==1)assert.equal(peer.child.referenced,true,'one pending request keeps the owner referenced');
  }
  assert.deepEqual(await Promise.all(tasks),Array.from({length:64},(_,i)=>'回复-'+(i+1)));assert.equal(peer.child.referenced,false);
  const failed=peer.session.request('failure',[]);peer.child.stdout.write(frame({id:65,error:{code:'fixture-failed',message:'读取失败'}}));
  await assert.rejects(failed,error=>error.code==='fixture-failed'&&error.message==='读取失败');
  assert.equal(peer.fatal,0);assert.equal(peer.child.referenced,false);
  const first=peer.session.request('first',[]),second=peer.session.request('second',[]);void first.catch(()=>undefined);void second.catch(()=>undefined);
  peer.child.stdout.write(frame({id:999,result:'forged'}));await assert.rejects(first,/unavailable/);await assert.rejects(second,/unavailable/);assert.equal(peer.fatal,1);
  peer.child.stdout.write(frame({id:66,result:'late'}));assert.equal(peer.fatal,1);assert.throws(()=>peer.session.request('closed',[]),/unavailable/);
  for(const response of [{id:1,result:null,extra:true},{id:1,error:{code:1,message:'bad'}},{id:1.5,result:null},{result:null}]){
   const bad=open(),pending=bad.session.request('test',[]);void pending.catch(()=>undefined);bad.child.stdout.write(frame(response));await assert.rejects(pending,/unavailable/);assert.equal(bad.fatal,1);
  }
  const duplicate=open(),accepted=duplicate.session.request('accepted',[]);duplicate.child.stdout.write(frame({id:1,result:true}));assert.equal(await accepted,true);
  const after=duplicate.session.request('after',[]);void after.catch(()=>undefined);duplicate.child.stdout.write(frame({id:1,result:'duplicate'}));await assert.rejects(after,/unavailable/);assert.equal(duplicate.fatal,1);
  for(const kind of['stdin','stdout']){
   const broken=open(),pending=broken.session.request('test',[]);void pending.catch(()=>undefined);broken.child[kind].emit('error',Error('EPIPE'));await assert.rejects(pending,/unavailable/);assert.equal(broken.fatal,1);
  }
  const oversized=open(),pending=oversized.session.request('test',[]);void pending.catch(()=>undefined);oversized.child.stdout.write(Buffer.from([255,255,255,127]));await assert.rejects(pending,/unavailable/);
  console.log('Core Node RPC session: unchanged wire fields, 64 requests, reversed/fragmented Unicode replies, reference lifetime, remote failures, malformed/duplicate/unknown frames, pipe errors and closed-session rejection passed.');
 }finally{for(const peer of peers)peer.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
