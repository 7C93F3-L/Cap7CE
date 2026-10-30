const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
module.exports=async(root,output)=>{
  const compiled=await build({stdin:{contents:[
    'export {toComputerSearchArchiveConditions as convert} from "./core/node/resourceCatalog/domain/filters/computerSearchArchiveConditions";',
    'export * from "./core/node/resourceCatalog/domain/formats/exploreFormatFilters";',
    'export {fileFormatCapabilities as formats} from "./core/node/resourceCatalog/domain/formats/formatCapabilities";',
    'export {supportedThreeDFactExtensions as threeD} from "./core/node/resourceCatalog/domain/formats/threeDFactTypes";',
    'export {searchThreeDModelTypes, getThreeDModelTypeExtensions} from "./core/node/resourceCatalog/domain/formats/threeDSearchFilters";'
  ].join('\n'),resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});
  const module={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(module,module.exports);
  const api=module.exports,groups=[];
  function group(id,title,kind,gate,key,values,labels,fields,mode='single',range='',maximum=1000000000,minimum=0,any=[]) {
    const options=values.map((value,i)=>{
      const facts=api.convert({fileFormat:'all',[key]:mode==='union'||mode==='flags'?[value]:value}).facts;
      assert(facts?.kind===kind,`${id}/${value}: unexpected converter result`);
      return {id:value,label:labels[i],facts};
    });
    groups.push({id,title,kind,allowed:api.formats.map(f=>f.extension).filter(ext=>api[gate]([ext])),any,
      fields,mode,range,maximum,minimum,options});
  }
  group('document-count','内容页数','document','isDocumentOnlyExtensionSelection','documentContentCountPreset',
    ['one','2-10','11-50','51-100','over-100'],['1','2–10','11–50','51–100','＞100'],['document.minimumContentCount','document.maximumContentCount'],'single','scalar',2000000000);
  group('document-images','文档图文','document','isDocumentOnlyExtensionSelection','documentImageComposition',
    ['without-images','with-images'],['纯文字','含图片'],['document.hasEmbeddedImages']);
  group('artboards','画板','document','isArtboardDocumentOnlyExtensionSelection','artboardCountPreset',
    ['one','2-5','6-10','11-20','over-20'],['1','2–5','6–10','11–20','＞20'],['document.minimumArtboardCount','document.maximumArtboardCount'],'single','scalar');
  group('three-d-count','三角面','three-d','isThreeDOnlyExtensionSelection','threeDTriangleCountPreset',
    ['under-10k','10k-100k','100k-1m','over-1m'],['＜1万','1–10万','10–100万','≥100万'],['threeD.minimumTriangleCount','threeD.maximumTriangleCount'],'single','scalar',2000000000,0,api.threeD);
  group('three-d-structure','三维结构','three-d','isThreeDOnlyExtensionSelection','threeDStructures',
    ['static','animated','rigged'],['静态','动画','骨骼'],['threeD.structures'],'union','',0,0,api.threeD);
  group('model-count','模型参数','model','isModelOnlyExtensionSelection','modelParameterCounts',
    ['under-1b','1b-3b','3b-7b','7b-14b','14b-or-more'],['＜1B','1–3B','3–7B','7–14B','≥14B'],['model.parameterRanges'],'union','array',1000000000000000,1);
  group('model-precision','模型精度','model','isModelOnlyExtensionSelection','modelPrecisions',
    ['f32','f16-bf16','8bit','6bit','5bit','4bit','3bit-or-less'],['F32','F16/BF16','8 bit','6 bit','5 bit','4 bit','≤3 bit'],['model.precisions'],'union');
  group('font-weight','字重','font','isFontOnlyExtensionSelection','fontWeights',
    ['thin','regular','medium','bold','black'],['纤细','常规','中等','粗体','特粗'],['font.weightRanges'],'union','array',1000,1);
  group('font-style','字形','font','isFontOnlyExtensionSelection','fontStyles',['normal','italic'],['正体','斜体'],['font.italic'],'flags');
  group('font-charset','字符集','font','isFontOnlyExtensionSelection','fontCharacterSets',['chinese','latin'],['中文','拉丁'],['font.supportsChinese','font.supportsLatin'],'flags');
  group('font-kind','字体类型','font','isFontOnlyExtensionSelection','fontKinds',['static','variable'],['静态','可变'],['font.variable'],'flags');
  group('text-characters','字符数','text-data','isTextOnlyExtensionSelection','textCharacterCountPreset',
    ['up-to-100','101-1000','1001-10000','10001-100000','over-100000'],['≤100','101–1千','1千–1万','1万–10万','＞10万'],['textData.minimumCharacterCount','textData.maximumCharacterCount'],'single','scalar');
  group('text-lines','行数','text-data','isTextOnlyExtensionSelection','textLineCountPreset',
    ['up-to-10','11-50','51-200','201-1000','over-1000'],['≤10','11–50','51–200','201–1千','＞1千'],['textData.minimumLineCount','textData.maximumLineCount'],'single','scalar');
  for(const [id,gate,key] of [['csv','isCsvOnlyExtensionSelection','csvRecordCountPreset'],['json','isJsonOnlyExtensionSelection','jsonItemCountPreset']])
    group(id+'-records','记录数','text-data',gate,key,['up-to-10','11-100','101-1000','1001-10000','over-10000'],['≤10','11–100','101–1千','1千–1万','＞1万'],['textData.minimumRecordCount','textData.maximumRecordCount'],'single','scalar');
  group('csv-columns','列数','text-data','isCsvOnlyExtensionSelection','csvColumnCountPreset',['one','2-5','6-10','11-30','over-30'],['1','2–5','6–10','11–30','＞30'],['textData.minimumColumnCount','textData.maximumColumnCount'],'single','scalar');
  group('json-root','JSON 结构','text-data','isJsonOnlyExtensionSelection','jsonRootKind',['array','object'],['数组','对象'],['textData.jsonRootKind']);
  group('archive-count','文件数量','archive','isArchiveOnlyExtensionSelection','archiveEntryCountPreset',['under-10','10-100','100-1000','over-1000'],['＜10','10–100','100–1千','≥1千'],['archive.minimumFileCount','archive.maximumFileCount'],'single','scalar',2000000000);
  group('archive-content','包内类型','archive','isArchiveOnlyExtensionSelection','archiveContentTypes',
    ['image','video','audio','document','project','threeD','program','other'],['图像','视频','音频','文档','工程','三维','程序','其他'],['archive.contentTypes'],'union');
  group('archive-structure','目录结构','archive','isArchiveOnlyExtensionSelection','archiveStructures',['flat','nested'],['平铺','嵌套'],['archive.structures'],'union');
  fs.writeFileSync(path.join(output,'filter-advanced-options.json'),JSON.stringify(groups));
  const media=[];
  function mediaGroup(id,key,values,labels,multiple=false){media.push({id,options:values.map((value,i)=>({id:value,label:labels[i],facts:api.convert({fileFormat:'all',[key]:multiple?[value]:value}).facts}))});}
  mediaGroup('video-resolution','videoResolutions',['720p','1080p','2k','4k','8k'],['720p','1080p','2K','4K','8K'],true);
  mediaGroup('video-duration','videoDurationPreset',['under-15s','15s-1m','1m-5m','over-5m'],['＜15秒','15秒–1分','1–5分','≥5分']);
  mediaGroup('audio-duration','audioDurationPreset',['under-5s','5s-30s','30s-5m','over-5m'],['＜5秒','5–30秒','30秒–5分','≥5分']);
  mediaGroup('audio-channels','audioChannels',['mono','stereo','multichannel'],['单声道','立体声','多声道'],true);
  for(const [id,key] of [['image-dimensions-aspect','imageAspectRatios'],['video-aspect','videoAspectRatios']])
    mediaGroup(id,key,['portrait','landscape','square','wide','tall'],['竖图','横图','方形','宽图','长图'],true);
  fs.writeFileSync(path.join(output,'filter-media-options.json'),JSON.stringify(media));
  fs.writeFileSync(path.join(output,'filter-three-d-types.json'),JSON.stringify(api.searchThreeDModelTypes.map((id,i)=>({id,label:['多边形','CAD','场景'][i],extensions:api.getThreeDModelTypeExtensions([id])}))));
};
