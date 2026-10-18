const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-command-operations-'));
esbuild.buildSync({stdin:{contents:"export {catalogCommandSpecs,parseCatalogCommand} from './src/renderer/quick-commands/catalogCommandRegistry'; export {prepareCatalogCommand} from './src/renderer/quick-commands/catalogCommandOperation'; export {CatalogQuickCommandSettingsRows} from './src/renderer/quick-commands/CatalogQuickCommandSettingsRows';",resolveDir:path.resolve(__dirname,'..'),loader:'ts'},bundle:true,platform:'node',outfile:path.join(root,'commands.cjs')});
const {catalogCommandSpecs,parseCatalogCommand,prepareCatalogCommand,CatalogQuickCommandSettingsRows}=require(path.join(root,'commands.cjs'));
(async()=>{try{
 const calls=[],preferences={commandEnabled:true,appearanceColors:{themeColor:'#123456',accentColor:'#abcdef'}},favorite={id:'fav',name:'Assets',path:'X:\\Assets'};
 let busy=false,failCache=false,failedStart=false;
 const prefs={get:async()=>preferences};for(const method of ['updateTheme','updateWindowMaterial','updateUiFontSize','updateLanguage','updateAppearanceColors','updateStandbyLineVisible','updateCommandEnabled'])prefs[method]=async value=>{calls.push([method,value]);return preferences};
 prefs.updateLaunchAtLogin=async value=>({launchAtLogin:value});prefs.updateSystemNotifications=async value=>({systemNotificationsEnabled:value});prefs.updateQuickActionGlobalEnabled=async value=>({quickActionGlobalEnabled:value});prefs.updateShortcutActions=async value=>{calls.push(['shortcuts',value]);return {applied:true}};
 global.window={cap7ce:{preferences:prefs,settingsWindow:{open:async()=>true},app:{quit:async()=>true},window:{setShellState:async(...args)=>{calls.push(['shell',...args]);return true},toggleNormalMaximized:async()=>({isMaximized:true}),setAlwaysOnTop:async actual=>({actual})},
  llamaRuntime:{settings:async()=>({versions:[{version:'v1'}]}),updateSelected:async selectedVersion=>({selectedVersion}),start:async()=>({status:failedStart?'failed':'running'}),stop:async()=>{calls.push(['stop']);return {status:'stopped'}}},
  ggufModels:{settings:async()=>({models:[{id:'m1',name:'Model One',loadable:true}]}),updateSelected:async selectedModelId=>({selectedModelId})},
  cache:{authorizeClear:async()=>{calls.push(['authorize']);return 'token'},clearAll:async token=>{if(failCache)throw Error('disk');calls.push(['clear',token]);return {cacheCount:0}}}}};
 const favorites={directories:[favorite],add:async p=>{calls.push(['add-favorite',p]);return true},rename:async(...args)=>{calls.push(['rename-alias',...args]);return true},remove:async id=>{calls.push(['remove-favorite',id]);return true},reload:async()=>true};
 const page={sort:'name-ascending',setSort:async value=>{page.sort=value;return true},showHidden:false,setHidden:async value=>{page.showHidden=value;return true},includeSubfolders:false,setSubfolders:async value=>{page.includeSubfolders=value;return true},home:()=>calls.push(['home']),refresh:async()=>true};
 const prepare=text=>{const parsed=parseCatalogCommand(text);assert.equal(parsed.type,'valid',text);return prepareCatalogCommand(parsed.command,page,favorites,value=>calls.push(['open',value?.id??null]),()=>busy)};
 const samples={see:['Assets'],dir:['Assets','Alias'],llama:['v1'],model:['m1']};
 for(const spec of catalogCommandSpecs){let args=spec.fixedArgs??[];if(spec.requiredArgs)args=spec.domain==='ui'?['#123abc']:spec.domain==='dir'&&spec.action==='add'?['X:\\Assets']:samples[spec.domain]??[];
  const text=spec.domain+':'+spec.action+(args.length?' '+args.map(a=>JSON.stringify(a)).join(' '):'');const operation=prepare(text);assert.equal(typeof await operation.run(),'string',text)}
 const rendered=CatalogQuickCommandSettingsRows({stableUi:true}),help=[...rendered.props.groups.flatMap(g=>g.items),...rendered.props.dangerousItems];
 for(const item of help)assert.equal(parseCatalogCommand(item.command).type,'valid',item.command);
 for(const text of ['C:\\Assets','portrait blue','https://example.test','y','n'])assert.equal(parseCatalogCommand(text).type,'search');
 for(const text of ['edge:on','cache:thumb','cache:skim','ai:search on','skim:','see:scope custom','dir:delete "Assets"'])assert.equal(parseCatalogCommand(text).type,'unknown');
 assert.equal(parseCatalogCommand('ui:dark',false).type,'search');assert.equal(parseCatalogCommand('cmd:on',false).type,'valid');assert.equal(parseCatalogCommand('ui：dark').type,'valid');
 assert.deepEqual(parseCatalogCommand('see:hidden ON').command.args,['on']);assert.deepEqual(parseCatalogCommand('model:use "Model One"').command.args,['Model One']);
 const before=calls.length,remove=prepare('dir:remove "Assets"'),clear=prepare('cache:clear');assert.ok(remove.confirmation.includes('y / n'));assert.ok(clear.confirmation.includes('y / n'));assert.equal(calls.length,before,'preparing confirmation has no side effect');
 await remove.run();assert.deepEqual(calls.at(-1),['remove-favorite','fav']);
 busy=true;await assert.rejects(prepare('llama:stop').run());assert.notEqual(calls.at(-1)[0],'stop');busy=false;
 failedStart=true;await assert.rejects(prepare('llama:start').run());failedStart=false;failCache=true;await assert.rejects(clear.run());
 await assert.rejects(prepare('ui:main invalid').run());await assert.rejects(prepare('model:use missing').run());
 favorites.directories=[favorite,{...favorite,id:'other',path:'Y:\\Assets'}];assert.throws(()=>prepare('dir:remove "Assets"'));const exact=prepare('dir:remove "X:\\Assets"');assert.ok(exact.confirmation);
 assert.ok(calls.some(c=>c[0]==='shell'&&c[1]==='normal'&&c[2].forceBounds));assert.ok(!calls.some(c=>c[0]==='rename-folder'),'rename operates on the favorite label, never the source folder');
 console.log(JSON.stringify({catalogSpecs:catalogCommandSpecs.length,helpItems:help.length,allOperationsInvoked:true,explicitConfirmation:true,retiredCommandsRejected:true,sourceFoldersUntouched:true}));
 }finally{delete global.window;assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
