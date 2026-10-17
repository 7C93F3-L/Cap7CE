const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CatalogViewPreferenceStore}=require('../dist-electron/catalogViewPreferenceStore.js');
const {readCatalogViewPreferences}=require('../dist-electron/catalogViewPreferenceRules.js');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-view-config-'));try{
 const file=path.join(root,'catalog-view.json'),store=new CatalogViewPreferenceStore(()=>file);
 assert.deepEqual(await store.get(),{});await assert.rejects(fs.stat(file),{code:'ENOENT'},'reading defaults creates no file');
 await Promise.all([store.update(null,{sort:'modified-descending'}),store.update(null,{showHidden:true}),store.update(null,{includeSubfolders:true}),
  store.update('X:\\Favorite',{sort:'name-descending',showHidden:false}),store.update('X:\\Other',{includeSubfolders:false})]);
 const expected={computer:{sort:'modified-descending',showHidden:true,includeSubfolders:true},'favorite:x:\\favorite':{sort:'name-descending',showHidden:false},'favorite:x:\\other':{includeSubfolders:false}};
 assert.deepEqual(await new CatalogViewPreferenceStore(()=>file).get(),expected,'restart retains independent scopes and merged rapid field changes');
 await Promise.all([store.update(null,{sort:'name-descending'}),store.update(null,{sort:'modified-ascending'}),store.update('x:/FAVORITE/',{includeSubfolders:true})]);
 assert.equal((await store.get()).computer.sort,'modified-ascending');assert.deepEqual((await store.get())['favorite:x:\\favorite'],{sort:'name-descending',showHidden:false,includeSubfolders:true});
 const before=await fs.readFile(file,'utf8');
 for(const patch of [{},null,[],{sort:'invalid'},{sort:1},{showHidden:'false'},{includeSubfolders:null},{randomEnabled:true},{showHidden:true,extra:false}])await assert.rejects(store.update(null,patch),/invalid-preference/);
 await assert.rejects(store.update('relative',{showHidden:true}),/invalid-preference/);assert.equal(await fs.readFile(file,'utf8'),before,'invalid writes preserve prior configuration');
 await store.relocate({oldPath:'X:\\Favorite',newPath:'X:\\Renamed'});const renamed=await store.get();assert.ok(!renamed['favorite:x:\\favorite']);assert.deepEqual(renamed['favorite:x:\\renamed'],{sort:'name-descending',showHidden:false,includeSubfolders:true});
 assert.deepEqual(readCatalogViewPreferences({computer:{sort:'wrong'},'favorite:x:\\a':{showHidden:false},bad:{sort:'name-ascending'}}),{'favorite:x:\\a':{showHidden:false}});
 assert.deepEqual(await fs.readdir(root),['catalog-view.json'],'no temporary config remains');
 console.log('View preferences: partial field merge, rapid writes, separate scopes, restart, explicit false, validation, no default writes and rename migration passed.');
}finally{await fs.rm(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1});
