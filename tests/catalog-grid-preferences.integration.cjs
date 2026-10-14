const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CatalogGridPreferenceStore}=require('../dist-electron/catalogGridPreferenceStore.js');
const {registerCatalogGridPreferenceIpc}=require('../dist-electron/catalogGridPreferenceIpc.js');
const {isCatalogGridSize,readCatalogGridSizes}=require('../dist-electron/catalogGridSizeRules.js');

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'Cap7CE-grid-config-'));
  try {
    const file=path.join(root,'catalog-grid.json'),other=path.join(root,'preferences.json');
    const original='{"themePreference":"dark","unrelated":true}\n';await fs.writeFile(other,original);
    const sizesFile=path.join(root,'catalog-grid-sizes.json'),store=new CatalogGridPreferenceStore(()=>file),handles=new Map();
    const sizeStore=new CatalogGridPreferenceStore(()=>sizesFile,{read:readCatalogGridSizes,valid:isCatalogGridSize});
    registerCatalogGridPreferenceIpc({handle:(channel,listener)=>handles.set(channel,listener),on:()=>{}},store,sizeStore);
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
    const getSize=()=>handles.get('preferences:getCatalogGridSize')({});
    const setSize=(scope,size)=>handles.get('preferences:updateCatalogGridSize')({},scope,size);
    assert.deepEqual(await getSize(),{});
    await Promise.all([setSize(null,125),setSize('X:\\Favorite A',75),setSize('X:\\Favorite B',160)]);
    assert.deepEqual(await new CatalogGridPreferenceStore(()=>sizesFile,{read:readCatalogGridSizes,valid:isCatalogGridSize}).get(),
      {computer:125,'favorite:x:\\favorite a':75,'favorite:x:\\favorite b':160},'sizes survive restart with the same independent scopes');
    await Promise.all([setSize(null,150),setSize(null,175),setSize('x:/FAVORITE A/',100)]);
    const sizesBefore=await fs.readFile(sizesFile,'utf8');
    assert.equal((await getSize()).computer,175);assert.equal((await getSize())['favorite:x:\\favorite a'],100);
    for(const size of [NaN,Infinity,0,205,102,'125',null])await assert.rejects(setSize(null,size),/invalid-preference/);
    await assert.rejects(setSize('relative',125),/invalid-preference/);
    assert.equal(await fs.readFile(sizesFile,'utf8'),sizesBefore,'invalid sizes leave configuration intact');
    assert.equal(await fs.readFile(file,'utf8'),before,'size changes never rewrite legacy mode settings');
    assert.equal(await fs.readFile(other,'utf8'),original,'other user preferences stay untouched');
    assert.deepEqual((await fs.readdir(root)).sort(),['catalog-grid-sizes.json','catalog-grid.json','preferences.json'],'no partial files remain');
    console.log('Catalog grid configuration: mode/size restart, independent favorites, normalization, serialized updates and invalid payload rejection passed.');
  } finally {
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
