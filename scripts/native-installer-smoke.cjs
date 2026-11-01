const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const installer=path.join(root,'release/winui-installer',`Cap7CE-Setup-${version}-x64.exe`);
const search=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?search(path.join(directory,e.name)):e.name==='7za.exe'?[path.join(directory,e.name)]:[]);
const sevenZip=search(path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/7zip@1.0.0'))[0];
const run=args=>{const r=spawnSync(sevenZip,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(r.status!==0)throw Error(r.stderr||'Archive verification failed');return r.stdout;};
const list=run(['l','-ba',installer]).replaceAll('\\','/');
for(const name of ['Cap7CE.exe','Cap7CE.WinUI.dll','Cap7CE.pri','Cap7CE.WinUI.pri','cap7ce-native.json','core/artifacts/development-product-host/Cap7CE.Core.Host.exe','core/artifacts/product-capability/v1/bundle/Cap7CE.Core.Setup.exe','artifacts/metadata-worker/v1/node.exe','artifacts/metadata-worker/v1/application-updates.cjs']) assert(list.includes('app/'+name),`Missing native payload: app/${name}`);
for(const name of ['resources/app.asar','chrome_100_percent.pak','electron.exe'])assert(!list.toLowerCase().includes(name.toLowerCase()),`Electron payload leaked: ${name}`);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cap7ce-native-installer-'));
try {
run(['x','-y',`-o${directory}`,installer]);
// NSIS injects this machine-wide helper; customInstall moves it inside app.
assert.deepEqual(fs.readdirSync(directory).filter(name=>name!=='$PLUGINSDIR'),['app','resources'],'Only the app and NSIS helper belong in the bundled install root');
assert.deepEqual(fs.readdirSync(path.join(directory,'resources')),['elevate.exe']);
const app=path.join(directory,'app');
const marker=JSON.parse(fs.readFileSync(path.join(app,'cap7ce-native.json'),'utf8'));
assert.equal(marker.layout,'installed-app');
const notices=JSON.parse(fs.readFileSync(path.join(app,'licenses/components.json'),'utf8'));
assert.equal(notices.version,version);
for(const name of ['Markdig','AngleSharp','Microsoft.WindowsAppSDK','Microsoft.NETCore.App.Runtime.win-x64']) {
  const component=notices.components.find(item=>item.name===name);assert(component,`Missing runtime notice: ${name}`);
  for(const file of component.files)assert(fs.statSync(path.join(app,'licenses',file)).size>100,`Empty runtime notice: ${file}`);
}
assert.equal(require('../build/winui.electron-builder.cjs').win.executableName, 'Cap7CE', 'NSIS shortcut target must match installed entry');
assert.deepEqual(fs.readFileSync(path.join(app,'Cap7CE.pri')),fs.readFileSync(path.join(app,'Cap7CE.WinUI.pri')),'Renamed apphost must have matching PRI resources');
assert.equal(marker.shell,'WinUI');assert.equal(marker.version,version);
assert(fs.readFileSync(path.join(app,'Cap7CE.exe')).includes(Buffer.from('Cap7CE.WinUI.dll')),'Installer entry must be the native .NET apphost');
const runtime=JSON.parse(fs.readFileSync(path.join(app,'Cap7CE.WinUI.runtimeconfig.json'),'utf8')).runtimeOptions;
assert(runtime.includedFrameworks?.length>0&&!runtime.framework&&!runtime.frameworks,'Installer configuration entry must use its bundled .NET runtime');
const entry=spawnSync(path.join(app,'Cap7CE.exe'),['--verify-search-setup-entry'],{encoding:'utf8',windowsHide:true,timeout:15000,
  env:{...process.env,DOTNET_ROOT_X64:'C:\\nonexistent-cap7ce-runtime',DOTNET_MULTILEVEL_LOOKUP:'0'}});
assert.equal(entry.status,0,'Packaged installer setup entry must run without initializing UI or requiring installed .NET: '+entry.stdout+entry.stderr);
const setup=path.join(app,'core/artifacts/product-capability/v1/bundle/Cap7CE.Core.Setup.exe');
const verified=spawnSync(setup,['--verify-payload'],{encoding:'utf8',windowsHide:true,env:{...process.env,DOTNET_ROOT_X64:'C:\\nonexistent-cap7ce-runtime',DOTNET_MULTILEVEL_LOOKUP:'0'}});
assert.equal(verified.status,0,verified.stdout+verified.stderr);
const report=JSON.parse(verified.stdout.trim());assert.equal(report.status,'verified');assert.equal(report.systemChangesPerformed,false);
console.log('Native installer payload passed: WinUI apphost, identity, runtime and Setup included; Electron shell excluded. Installation still requires manual verification.');
console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex')}`);
} finally {
assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('cap7ce-native-installer-'));
fs.rmSync(directory,{recursive:true,force:true});
}
