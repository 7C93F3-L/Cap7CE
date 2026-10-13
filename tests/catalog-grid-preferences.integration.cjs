const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CatalogGridPreferenceStore}=require('../dist-electron/catalogGridPreferenceStore.js');
const {registerCatalogGridPreferenceIpc}=require('../dist-electron/catalogGridPreferenceIpc.js');

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-grid-config-'));
  try {
    const file=path.join(root,'catalog-grid.json'),other=path.join(root,'preferences.json');
    const original='{"themePreference":"dark","unrelated":true}\n';await fs.writeFile(other,original);
    const store=new CatalogGridPreferenceStore(()=>file),handles=new Map();
    registerCatalogGridPreferenceIpc({handle:(channel,listener)=>handles.set(channel,listener),on:()=>{}},store);
    const get=()=>handles.get('preferences:getCatalogGrid')({});
    const set=(scope,mode)=>handles.get('preferences:updateCatalogGrid')({},scope,mode);
    assert.deepEqual(await get(),{});
    await Promise.all([set(null,'gallery'),set('X:\\Favorite A\\','square'),set('X:/Favorite B','gallery')]);
    assert.deepEqual(await new CatalogGridPreferenceStore(()=>file).get(),{
      computer:'gallery','favorite:x:\\favorite a':'square','favorite:x:\\favorite b':'gallery'
    },'restart retains separate computer and favorite configurations');
    await Promise.all([set(null,'square'),set(null,'gallery'),set('x:/FAVORITE A','gallery')]);
    assert.equal((await get()).computer,'gallery','rapid writes preserve final selection');
    assert.equal((await get())['favorite:x:\\favorite a'],'gallery','path spelling variants share a favorite');
    assert.equal((await get())['favorite:x:\\favorite b'],'gallery','other favorites remain unchanged');
    await set('X:\\','square');assert.equal((await get())['favorite:x:'],'square','a favorite drive root survives reload');
    const before=await fs.readFile(file,'utf8');
    await assert.rejects(set('relative-folder','square'),/invalid-preference/);
    await assert.rejects(set(null,'unexpected-mode'),/invalid-preference/);
    assert.equal(await fs.readFile(file,'utf8'),before,'invalid payloads do not change configuration');
    assert.equal(await fs.readFile(other,'utf8'),original,'other user preferences stay untouched');
    assert.deepEqual((await fs.readdir(root)).sort(),['catalog-grid.json','preferences.json'],'no partial files remain');
    console.log('Catalog grid configuration: restart, independent favorites, normalization, serialized updates and IPC validation passed.');
  } finally {
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
