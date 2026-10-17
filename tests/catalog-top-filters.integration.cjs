const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, BrowserWindow } = require('electron'), esbuild = require('esbuild');
const repo = path.resolve(__dirname, '..'), root = fs.mkdtempSync(path.join(os.tmpdir(), 'Cap7CE-top-filters-'));
app.setPath('userData', root + '-profile'); app.on('window-all-closed', () => {});
const fixture = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';import {fileFormatCapabilities} from './electron/formatCapabilities';
import Filters from './src/renderer/catalog-workspace/CatalogTopFilters';
import LegacyFilters from './src/renderer/stable-ui/StableExploreFilters';
import {workspaceFilterCount} from './src/renderer/workspace/workspaceFilterSummary';
import {setActiveLanguage} from './electron/localization';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
const initial={query:'keep',fileFormat:'all',timePreset:'all'},noop=()=>{};
function Fixture(){const [search,setSearch]=useState(initial),[language,setLanguage]=useState('zh-CN'),[legacy,setLegacy]=useState(false),[details,setDetails]=useState([]);
window.probe={search,setSearch:value=>flushSync(()=>setSearch(value)),language:value=>flushSync(()=>setLanguage(value)),details:value=>flushSync(()=>setDetails(value)),legacy:setLegacy,formats:fileFormatCapabilities.map(c=>c.extension)};setActiveLanguage(language);
return <div className="app cap-stable-ui theme-dark" style={{padding:16,boxSizing:'border-box',width:'100%',height:'100vh'}}>
{legacy?<LegacyFilters search={search} availableFormats={['png','mp4','mp3','pdf']} detailDomains={[]} closeFlyoutRequest={0} onFlyoutOpen={noop} onSearchOptionsChange={setSearch}/>:
<Filters search={search} availableFormats={fileFormatCapabilities.map(c=>c.extension)} detailDomains={details} attributes={{disabled:false,colorsDisabled:false}}
onChange={setSearch} count={workspaceFilterCount(search)} onClear={()=>setSearch(initial)}/>}</div>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async () => {
  let win;
  try {
    esbuild.buildSync({ stdin: { contents: fixture, resolveDir: repo, loader: 'tsx' }, bundle: true, platform: 'browser', outfile: path.join(root, 'fixture.js'), define: { 'process.env.NODE_ENV': '"production"' } });
    fs.writeFileSync(path.join(root, 'index.html'), '<link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
    win = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const run = code => win.webContents.executeJavaScript(code);
    const ready = async code => { for (let n = 0; n < 150; n++) { if (await run(code)) return; await new Promise(r => setTimeout(r, 20)); } throw Error('Timeout ' + code); };
    const frame = () => run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
    await win.loadFile(path.join(root, 'index.html')); await ready('document.querySelectorAll(".cap-stable-time-labels button").length===6'); await frame();
    const geometry = () => run(`(()=>{const root=document.querySelector('.cap-catalog-top-filters'),scroll=root.querySelector('.cap-catalog-top-filter-scroll'),buttons=[...root.querySelectorAll('.cap-stable-time-labels button')],groups=[...root.querySelectorAll('.cap-stable-explore-filters section')];return {
      height:root.getBoundingClientRect().height,overflow:scroll.scrollWidth>scroll.clientWidth,
      insets:[scroll.getBoundingClientRect().top-root.getBoundingClientRect().top,root.getBoundingClientRect().bottom-scroll.querySelector('.cap-catalog-top-filter-content').getBoundingClientRect().bottom],
      width:root.querySelector('.cap-catalog-top-filter-content').getBoundingClientRect().width,
      rows:buttons.map(e=>e.getBoundingClientRect().top),labels:buttons.map(e=>e.innerText),
      clipped:groups.some(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1),
      clippedControls:[...root.querySelectorAll('section button')].some(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1),
      headers:groups.map(e=>e.querySelector('header').getBoundingClientRect().top),
      within:buttons.every(e=>e.getBoundingClientRect().bottom<=scroll.getBoundingClientRect().bottom),
      slider:getComputedStyle(root.querySelector('.cap-stable-time-control')).display
    }})()`);
    const balancedInsets = layout => { assert.equal(layout.height,88); assert.deepEqual(layout.insets,[4,4],'top and bottom padding match without a scrollbar reserve'); };
    let layout = await geometry(); balancedInsets(layout); assert.equal(layout.overflow, false); assert.equal(layout.clipped, false); assert.equal(layout.within, true); assert.equal(layout.slider, 'none');
    const wheel = options => run(`(()=>{const node=document.querySelector('.cap-catalog-top-filter-scroll'),event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...${JSON.stringify(options)}});node.dispatchEvent(event);return {left:node.scrollLeft,prevented:event.defaultPrevented}})()`);
    assert.equal(await run('getComputedStyle(document.querySelector(".cap-catalog-top-filter-scroll")).scrollbarWidth'),'none');
    assert.equal(await run('getComputedStyle(document.querySelector(".cap-catalog-top-filter-scroll"),"::-webkit-scrollbar").display'),'none');
    assert.equal((await wheel({deltaY:120})).prevented,false,'no overflow does not capture wheel events');
    assert.deepEqual(layout.labels, ['本周', '当月', '今年', '去年', '更早', '全部']);
    assert.equal(new Set(layout.rows).size, 2); assert.equal(new Set(layout.headers).size, 1);
    assert.ok(layout.width<=740,'basic controls including all file categories stay compact: '+layout.width);
    const spacing=await run(`(()=>{const actions=document.querySelector('.cap-catalog-filter-actions'),size=document.querySelector('.cap-stable-file-size-filter'),buttons=[...size.querySelectorAll('.cap-stable-file-size-options button')];return {actions:actions.getBoundingClientRect().width,size:size.getBoundingClientRect().width,clearTop:actions.querySelector('button').getBoundingClientRect().top,timeTop:document.querySelector('.cap-stable-time-labels button').getBoundingClientRect().top,rows:buttons.map(e=>e.getBoundingClientRect().top),widths:buttons.map(e=>e.getBoundingClientRect().width)}})()`);
    assert.ok(spacing.actions<=80&&spacing.size<=180,'summary and size controls use content widths: '+JSON.stringify(spacing));
    assert.equal(spacing.clearTop,spacing.timeTop,'clear action aligns with the first preset row');
    assert.equal(new Set(spacing.rows).size,2);assert.equal(spacing.rows.filter(y=>y===spacing.rows[0]).length,3);
    assert.ok(spacing.widths[0]<spacing.widths[3],'long second-row label does not stretch the first-row button');
    const types = await run(`(()=>{const group=document.querySelector('.cap-stable-file-type-filter'),buttons=[...group.querySelectorAll('.cap-stable-file-type-options button')];return {labels:buttons.map(e=>e.innerText),rows:buttons.map(e=>e.getBoundingClientRect().top),icons:group.querySelectorAll('svg,.cap-stable-type-glyph').length,edit:group.querySelectorAll('header button').length}})()`);
    assert.deepEqual(types.labels,['图像','视频','音频','文档','文本','项目','三维','压缩包','数据','字体','模型','其他']);
    assert.equal(new Set(types.rows).size,2);assert.equal(types.rows.filter(row=>row===types.rows[0]).length,6);
    assert.equal(types.icons,0);assert.equal(types.edit,0,'format editor and other-category popup entry removed');
    for(const [index,extension] of ['.png','.mp4','.mp3','.pdf','.txt','.aep','.obj','.zip','.csv','.ttf','.gguf'].entries()){
      await run(`document.querySelectorAll('.cap-stable-file-type-options button')[${index}].click()`);
      await ready(`probe.search.selectedExtensions?.includes('${extension}')`);
      assert.equal(await run('probe.search.query'),'keep');
      assert.equal(await run('!!document.querySelector(".cap-stable-sidebar-flyout")'),false,'categories apply without a popup');
    }
    assert.equal(await run('document.querySelectorAll(".cap-stable-file-type-options [aria-pressed=true]").length'),11,'all categories can be combined');
    for(let index=10;index>=0;index--){
      await run(`document.querySelectorAll('.cap-stable-file-type-options button')[${index}].click()`);
      await ready(`document.querySelectorAll('.cap-stable-file-type-options [aria-pressed=true]').length===${index}`);
    }
    assert.equal(await run('probe.search.selectedExtensions'),undefined,'clearing last category restores unrestricted types');
    await run(`probe.setSearch({query:'keep',fileFormat:'all',timePreset:'week',fileSizePreset:'under-1mb',selectedExtensions:['.png'],imageAnimation:'animated'})`);
    await run('document.querySelectorAll(".cap-stable-file-type-options button")[11].click()');await ready('probe.search.unclassifiedOnly===true');
    assert.equal(await run('probe.search.selectedExtensions'),undefined);assert.equal(await run('probe.search.imageAnimation'),undefined);
    assert.deepEqual(await run('[probe.search.query,probe.search.timePreset,probe.search.fileSizePreset]'),['keep','week','under-1mb']);
    assert.equal(await run('document.querySelectorAll(".cap-stable-file-type-options [aria-pressed=true]").length'),1);
    await run('document.querySelectorAll(".cap-stable-file-type-options button")[9].click()');await ready('probe.search.selectedExtensions?.includes(".ttf")');
    assert.equal(await run('probe.search.unclassifiedOnly'),undefined,'known category exits other mode');
    await run('document.querySelectorAll(".cap-stable-file-type-options button")[11].click()');await ready('probe.search.unclassifiedOnly===true');
    assert.equal(await run('document.querySelector(".cap-catalog-filter-actions button").disabled'),false,'other is counted as an active filter');
    await run('document.querySelectorAll(".cap-stable-file-type-options button")[11].click()');await ready('!probe.search.unclassifiedOnly');
    assert.equal(await run('probe.search.selectedExtensions'),undefined,'second other click restores all types');
    await run(`probe.setSearch({query:'keep',fileFormat:'all',timePreset:'all'})`);
    for(const [index,preset] of ['under-1mb','1mb-10mb','10mb-100mb','100mb-1gb','1gb-or-more'].entries()){
      await run(`document.querySelectorAll('.cap-stable-file-size-options button')[${index}].click()`);await ready(`probe.search.fileSizePreset==='${preset}'`);
      assert.equal(await run('probe.search.query'),'keep');
      await run(`document.querySelectorAll('.cap-stable-file-size-options button')[${index}].click()`);await ready('!probe.search.fileSizePreset');
    }
    await run('document.querySelector(".cap-stable-file-size-filter header button").click()');await ready('document.querySelectorAll(".cap-stable-file-size-fields input").length===2');
    await run(`(()=>{const fields=document.querySelectorAll('.cap-stable-file-size-fields input');['1.5','2'].forEach((value,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value);fields[i].dispatchEvent(new Event('input',{bubbles:true}))})})()`);await frame();
    await run('document.querySelector(".cap-stable-file-size-flyout .cap-stable-flyout-actions .is-selected").click()');await ready('probe.search.fileSizeRange?.minBytes===1572864');
    assert.equal(await run('probe.search.fileSizeRange.maxBytes'),2097152);
    assert.deepEqual(await run('(()=>{const e=document.querySelector(".cap-stable-file-size-filter header span");return [e.innerText,e.title]})()'),['自定义','1,536 KB – 2 MB']);
    assert.equal(await run('document.querySelectorAll(".cap-stable-file-size-options [aria-pressed=true]").length'),0);
    await run('document.querySelector(".cap-stable-file-size-options button").click()');await ready('!probe.search.fileSizeRange');
    assert.equal(await run('!!document.querySelector(".cap-stable-file-size-filter header span")'),false,'preset selection removes custom feedback');
    for(const [range,title] of [[{minBytes:1048576},'≥ 1 MB'],[{maxBytes:2097152},'≤ 2 MB']]){
      await run(`probe.setSearch({query:'keep',fileFormat:'all',timePreset:'all',fileSizeRange:${JSON.stringify(range)}})`);
      assert.equal(await run('document.querySelector(".cap-stable-file-size-filter header span").title'),title);
    }
    await run(`probe.setSearch({query:'keep',fileFormat:'all',timePreset:'all'})`);
    if (process.env.CAP_TOP_FILTERS_CAPTURE) fs.writeFileSync(process.env.CAP_TOP_FILTERS_CAPTURE, (await win.webContents.capturePage()).toPNG());
    for (const [index, preset] of ['week', 'month', 'year', 'last-year', 'older', 'all'].entries()) {
      await run(`document.querySelectorAll('.cap-stable-time-labels button')[${index}].click()`); await ready(`probe.search.timePreset==='${preset}'`);
      assert.equal(await run('probe.search.query'), 'keep'); assert.equal(await run('document.querySelectorAll(".cap-stable-time-labels [aria-pressed=true]").length'), 1);
    }
    await run('document.querySelector(".cap-stable-time-filter header button").click()'); await ready('document.querySelectorAll("input[type=date]").length===2');
    await run(`(()=>{const fields=document.querySelectorAll('input[type=date]');['2026-09-01','2026-09-08'].forEach((value,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value);fields[i].dispatchEvent(new Event('input',{bubbles:true}))})})()`); await frame();
    await run('document.querySelector(".cap-stable-flyout-actions .is-selected").click()'); await ready('probe.search.timePreset==="custom"');
    assert.deepEqual(await run('(()=>{const e=document.querySelector(".cap-stable-time-filter header span");return [e.innerText,e.title]})()'), ['自定义', '2026.09.01 ～ 2026.09.08']);
    assert.equal(await run('new Date(probe.search.modifiedTimeRange.endMs).getDate()'), 9, 'custom end remains exclusive');
    assert.equal(await run('document.querySelectorAll(".cap-stable-time-labels [aria-pressed=true]").length'), 0);
    await run('document.querySelectorAll(".cap-stable-time-labels button")[0].click()'); await ready('probe.search.timePreset==="week"&&!probe.search.modifiedTimeRange');
    await run('document.querySelector(".cap-catalog-filter-actions button").click()'); await ready('probe.search.timePreset==="all"');
    assert.equal(await run('document.querySelector(".cap-catalog-filter-actions button").disabled'), true);
    win.setContentSize(540, 400); await frame(); layout = await geometry(); balancedInsets(layout); assert.equal(layout.overflow, true); assert.equal(layout.clipped, false); assert.equal(layout.within, true);
    let moved=await wheel({deltaY:45});assert.equal(moved.prevented,true);assert.equal(moved.left,45,'ordinary mouse wheel scrolls horizontally');
    moved=await wheel({deltaY:-20});assert.equal(moved.left,25);
    moved=await wheel({deltaX:30});assert.equal(moved.left,55,'horizontal trackpad input is not doubled');
    moved=await wheel({deltaY:100,ctrlKey:true});assert.equal(moved.left,55);assert.equal(moved.prevented,false,'Ctrl wheel remains available to existing zoom policy');
    await run('document.querySelector(".cap-catalog-top-filter-scroll").scrollLeft=0');
    moved=await wheel({deltaY:1,deltaMode:1});assert.ok(moved.left>1,'line deltas are converted to pixels');
    moved=await wheel({deltaY:1,deltaMode:2});assert.equal(moved.left,await run('(()=>{const e=document.querySelector(".cap-catalog-top-filter-scroll");return e.scrollWidth-e.clientWidth})()'));
    assert.equal((await wheel({deltaY:100})).prevented,false,'wheel at the end is not trapped');
    await run('document.querySelector(".cap-catalog-top-filter-scroll").scrollLeft=60');
    win.webContents.sendInputEvent({type:'mouseWheel',x:200,y:60,deltaX:0,deltaY:-40});await ready('document.querySelector(".cap-catalog-top-filter-scroll").scrollLeft!==60');
    await run('document.querySelector(".cap-catalog-top-filter-scroll").scrollLeft=0');await frame();
    const before = await run('document.querySelector(".cap-catalog-filter-actions").getBoundingClientRect().left');
    await run('document.querySelector(".cap-stable-time-filter header button").click()'); await ready('document.querySelector(".cap-stable-sidebar-flyout")');
    assert.equal(await run(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});document.querySelector('.cap-stable-sidebar-flyout').dispatchEvent(e);return e.defaultPrevented})()`),false,'portal menu wheel is not captured by the filter strip');
    await wheel({deltaY:180}); await ready('!document.querySelector(".cap-stable-sidebar-flyout")');
    assert.ok(await run('document.querySelector(".cap-catalog-filter-actions").getBoundingClientRect().left') < before - 100, 'actions move with filters');
    await run('probe.language("en-US")'); await frame(); layout = await geometry(); assert.equal(layout.clipped, false, 'English labels fit their groups');
    await run('document.querySelector(".cap-stable-ui").style.setProperty("--cap-ui-font-secondary","14px")'); await frame(); layout = await geometry(); assert.equal(layout.clipped, false, 'larger labels remain reachable by horizontal scrolling');
    await run('probe.details(undefined)');
    const formats=await run('probe.formats'); let longest=0;
    for (const language of ['zh-CN','en-US']) for (const size of [11,14]) {
      await run(`probe.language(${JSON.stringify(language)});document.querySelector('.cap-stable-ui').style.setProperty('--cap-ui-font-secondary','${size}px')`);
      for (const extension of formats) {
        await run(`probe.setSearch({query:'keep',timePreset:'all',selectedExtensions:[${JSON.stringify(extension)}]})`);
        layout=await geometry();balancedInsets(layout);const context=`${language} ${size}px ${extension}`;
        assert.equal(layout.clipped,false,'groups fit without nested scrolling: '+context);
        assert.equal(layout.clippedControls,false,'button labels/icons fit: '+context);
        assert.equal(layout.within,true,'controls fit the compact bar: '+context);
        if(language==='zh-CN'&&size===11)longest=Math.max(longest,layout.width);
      }
    }
    assert.ok(longest<=1480,'longest default Chinese combination with all categories stays compact: '+longest);
    await run(`document.documentElement.style.setProperty('--cap-ui-font-base','16px');document.querySelector('.cap-stable-ui').style.removeProperty('--cap-ui-font-secondary')`);
    for(const language of ['zh-CN','en-US']){
      await run(`probe.language(${JSON.stringify(language)})`);
      for(const extension of formats){
        await run(`probe.setSearch({query:'keep',fileFormat:'all',timePreset:'all',selectedExtensions:[${JSON.stringify(extension)}]})`);
        layout=await geometry();balancedInsets(layout);assert.equal(layout.clipped,false,'maximum setting groups fit '+language+' '+extension);assert.equal(layout.clippedControls,false,'maximum setting controls fit '+language+' '+extension);
      }
    }
    await run(`document.documentElement.style.setProperty('--cap-ui-font-base','13px')`);
    await run(`probe.language('zh-CN');document.querySelector('.cap-stable-ui').style.setProperty('--cap-ui-font-secondary','11px');probe.setSearch({query:'keep',timePreset:'all',selectedExtensions:['.psd']})`);
    await run('document.querySelector(".cap-stable-image-animation-filter button").click()');await ready('probe.search.imageAnimation==="animated"');
    await run('document.querySelector(".cap-stable-image-color-filter header button").click()');await ready('document.querySelector(".cap-stable-sidebar-flyout")');
    await run('document.querySelector(".cap-catalog-top-filter-scroll").scrollLeft=0');await ready('!document.querySelector(".cap-stable-sidebar-flyout")');
    await run('probe.legacy(true)'); await ready('!document.querySelector(".cap-catalog-top-filters")');
    assert.notEqual(await run('getComputedStyle(document.querySelector(".cap-stable-time-control")).display'), 'none', 'legacy vertical filters retain their slider');
    assert.equal(await run('getComputedStyle(document.querySelector(".cap-stable-file-size-row")).display'),'contents','legacy size options retain their existing grid');
    console.log('Catalog top filters: all '+formats.length+' formats in both languages/font sizes, bounded height, no clipped controls, shared scrolling, custom dates and popup dismissal passed; longest '+Math.ceil(longest)+'px.');
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { win?.destroy(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); app.exit(process.exitCode ?? 0); }
});
