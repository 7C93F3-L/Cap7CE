const assert=require('node:assert/strict');
const {registerComputerSearchTrashIpc}=require('../dist-electron/computerSearchTrashIpc.js');
const handlers=new Map(),events=[],item={authorizationId:'A'.repeat(32),name:'fixture.txt',path:'X:\\fixture.txt',isDirectory:false};
let live=true,answer=false,held,gate;
registerComputerSearchTrashIpc({registrar:{handle:(name,handler)=>handlers.set(name,handler)},isSenderAllowed:event=>event.allowed===true,
 resolveItems:request=>{if(!live||request.token!=='valid')throw Error('authorization-expired');events.push('resolve');return [item]},
 confirm:async()=>{events.push('confirm');if(gate)await gate;return answer},
 trash:async items=>{events.push('trash');return {success:true,totalCount:items.length,deletedPaths:items.map(item=>item.path),failedItems:[]}}});
(async()=>{
 const invoke=(event={allowed:true},request={token:'valid'})=>handlers.get('computerSearch:moveToTrash')(event,request);
 await assert.rejects(()=>invoke({allowed:false}),/not allowed/);assert.deepEqual(events,[]);
 await assert.rejects(()=>invoke(undefined,{token:'forged'}),/authorization/);assert.deepEqual(events,[]);
 assert.deepEqual((await invoke()).deletedPaths,[]);assert.deepEqual(events,['resolve','confirm'],'cancel never trashes');
 events.length=0;answer=true;await invoke();assert.deepEqual(events,['resolve','confirm','resolve','trash']);
 events.length=0;gate=new Promise(resolve=>held=resolve);const pending=invoke();await Promise.resolve();
 await assert.rejects(()=>invoke(),/busy/);live=false;held();await assert.rejects(()=>pending,/authorization/);
 assert.equal(events.includes('trash'),false,'expired authorization after confirmation cannot delete');
 gate=null;live=true;events.length=0;await invoke();assert.equal(events.at(-1),'trash','busy guard clears after failure');
 console.log('Catalog trash IPC: Main-only authorization, cancel, revalidation, serialized confirmation and recovery passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
