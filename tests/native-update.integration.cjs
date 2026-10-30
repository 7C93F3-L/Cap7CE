const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require('esbuild');
const load=source=>{const text=esbuild.buildSync({entryPoints:[source],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'error'}).outputFiles[0].text;const m={exports:{}};new Function('module','exports','require',text)(m,m.exports,require);return m.exports;};
const {selectLatestAppUpdate,isValidAppUpdateAsset}=load('electron/appUpdateService.ts');
const {createNativeUpdateService}=load('core/node/applicationUpdates/service.ts');
(async()=>{
const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-native-update-'));
const bytes=Buffer.from('fixture-native-installer'),digest=crypto.createHash('sha256').update(bytes).digest('hex');
const release=(version,native)=>({tag_name:`v${version}`,draft:false,prerelease:false,assets:[{id:1,name:`Cap7CE-${native?'WinUI-':''}Setup-${version}-x64.exe`,state:'uploaded',size:bytes.length,digest:`sha256:${digest}`,browser_download_url:`https://github.com/7C93F3-L/Cap7CE/releases/download/v${version}/Cap7CE-${native?'WinUI-':''}Setup-${version}-x64.exe`}]});
const releases=[release('9.0.0',false),release('1.0.5',true)];
assert.equal(selectLatestAppUpdate(releases).version,'9.0.0');
const native=selectLatestAppUpdate(releases,'winui');assert.equal(native.version,'1.0.5');assert(!isValidAppUpdateAsset(native));assert(isValidAppUpdateAsset(native,'winui'));
const fetchReleases=async()=>new Response(JSON.stringify(releases),{status:200});
let downloads=0;
const fetchDownload=async()=>{downloads++;return new Response(bytes,{status:200,headers:{'Content-Length':String(bytes.length)}});};
let owner=createNativeUpdateService(root,'1.0.4',fetchReleases,fetchDownload);
try{
 const checked=await owner.dispatch('check',[]);assert.equal(checked.status,'update_available');assert.equal(checked.latestVersion,'1.0.5');
 await owner.dispatch('download',[]);
 let state;
 for(let i=0;i<100;i++){state=await owner.dispatch('state',[]);if(!state.busy)break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(state.status,'ready');assert.equal(state.error,null);assert.equal(downloads,1);
 const installer=await owner.dispatch('installer',[]);assert.equal(installer.status,'installing');assert.equal(path.basename(installer.installer),'Cap7CE-WinUI-Setup-1.0.5-x64.exe');
 await owner.close();owner=createNativeUpdateService(root,'1.0.4',fetchReleases,fetchDownload);
 assert.equal((await owner.dispatch('state',[])).status,'ready','restart must restore verified download');
 await fs.writeFile(installer.installer,'changed');
 const rejected=await owner.dispatch('installer',[]);assert.equal(rejected.status,'failed');assert.equal(rejected.installer,null,'corrupt installer cannot be handed to UI');
 const none=createNativeUpdateService(path.join(root,'none'),'1.0.4',async()=>new Response(JSON.stringify([release('9.0.0',false)])));
 assert.equal((await none.dispatch('check',[])).reason,'no_native_release');await none.close();
 console.log('Native update passed: legacy/native isolation, check/download/digest, restart recovery, install handoff and tamper rejection. Fixtures only; no installer executed.');
}finally{await owner.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
