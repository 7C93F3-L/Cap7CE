const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const directory='core/node/localKeywords',limits={'owner.ts':40,'requestHttp.ts':35,'requestModel.ts':30,'sourceFingerprint.ts':20,'validation.ts':40,'languagePrompt.ts':10};
assert.deepEqual(fs.readdirSync(path.join(root,directory)).filter(file=>file.endsWith('.ts')).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){
 const source=read(`${directory}/${file}`);assert.ok(source.split(/\r?\n/).length<=limit,`${file} domain size`);
 assert.doesNotMatch(source,/from ["']electron["']|Sqlite|sqlite|Reader\.Host|writeVisualCache|fs\.(?:write|rm|unlink|rename|mkdir)|setInterval\(|\.listen\(/,`${file} bounded local inference`);
}
const http=read(`${directory}/requestHttp.ts`);for(const anchor of['hostname: "127.0.0.1"','new http.Agent({ keepAlive: false','maximumResponseBytes = 1024 * 1024','agent.destroy()','path: "/v1/chat/completions"'])assert.ok(http.includes(anchor),anchor);
assert.doesNotMatch(http,/fetch\(|http\.globalAgent|process\.env|response\.headers\.location|https:/);
assert.ok(read(`${directory}/owner.ts`).includes('this.jobs.size >= 2'));assert.ok(read(`${directory}/validation.ts`).includes('value <= 120000'));
for(const[file,limit]of [['electron/catalogAutoKeywordModel.ts',10],['electron/catalogAutoKeywordSource.ts',18]]){
 const source=read(file);assert.ok(source.split(/\r?\n/).length<=limit);assert.doesNotMatch(source,/\bfetch\(|node:fs|\.lstat\(/);
}
assert.ok(read('electron/llamaRuntimeManager.ts').includes('LocalKeywordModelConnection as LlamaRuntimeConnection'));
assert.ok(read('electron/core/coreLocalKeywordsClient.ts').includes('service.requestActiveVisualCacheOwner'));
console.log('Core local keyword ownership, bounded direct-loopback HTTP, no disk publisher, shared contracts and thin Shell model/source adapters passed.');
