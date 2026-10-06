const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");
const source = path.resolve(__dirname,"../electron/textDataFactExtractor.ts");
const compiled = esbuild.buildSync({entryPoints:[source],bundle:true,write:false,platform:"node",format:"cjs",logLevel:"silent"});
const loaded = new Module(source,module);loaded.filename=source;loaded.paths=module.paths;loaded._compile(compiled.outputFiles[0].text,source);
const {readTextDataFact: read}=loaded.exports;
(async()=>{
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"cap7ce-text-data-boundary-"));
  const inspect=async(name,bytes)=>{const target=path.join(root,name);await fs.writeFile(target,bytes);return read(target);};
  try {
    assert.deepEqual(await inspect("empty.txt",""),{factKind:"text",characterCount:0,lineCount:0,recordCount:0,columnCount:0,jsonRootKind:"none"});
    const unicode=await inspect("boundary.txt","a".repeat(65535)+"🙂\r\n");
    assert.equal(unicode.characterCount,65538);assert.equal(unicode.lineCount,2,"a split UTF8 sequence and trailing CRLF preserve Unicode and line counts");
    const crlf=await inspect("crlf.md","a".repeat(65535)+"\r\nend");
    assert.equal(crlf.lineCount,2,"CRLF split across stream chunks is one break");
    const utf16=await inspect("utf16.txt",Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from("a".repeat(32767)+"🙂","utf16le")]));
    assert.equal(utf16.characterCount,32768,"split UTF16 surrogate pair is one character");
    const be=Buffer.from("你好🙂\r\nend","utf16le");be.swap16();
    const utf16be=await inspect("utf16be.txt",Buffer.concat([Buffer.from([0xfe,0xff]),be]));
    assert.equal(utf16be.characterCount,8);assert.equal(utf16be.lineCount,2);
    const csv=await inspect("boundary.csv",'"'+"a".repeat(65534)+'"",more",x\r\n\r\n"line\ninside",z\n');
    assert.equal(csv.recordCount,2);assert.equal(csv.columnCount,2,"escaped quote split across chunks and quoted line breaks retain record counts");
    const emptyCsv=await inspect("empty.csv","");assert.equal(emptyCsv.recordCount,0);assert.equal(emptyCsv.columnCount,0);
    const quotedEmpty=await inspect("quoted.csv",'""');assert.equal(quotedEmpty.recordCount,1);assert.equal(quotedEmpty.columnCount,1);
    for(const [name,content] of [["unclosed.csv",'"abc'],["trailing.csv",'"a"tail,b'],["embedded.csv",'unquoted"quote,b']])
      await assert.rejects(inspect(name,content),/text-data-csv-invalid/,"ambiguous quotes cannot publish reliable counts");
    const array=await inspect("empty-array.json","[]");assert.equal(array.recordCount,0);assert.equal(array.jsonRootKind,"array");
    const object=await inspect("empty-object.json","{}");assert.equal(object.recordCount,0);assert.equal(object.jsonRootKind,"object");
    await assert.rejects(inspect("scalar.json","true"),/text-data-json-root-unsupported/);
    await assert.rejects(inspect("broken.json",'{"a":'),/text-data-json-invalid/);
    await assert.rejects(inspect("binary.txt",Buffer.from([0xff])),/text-data-encoding-unsupported/);
    const oversize=path.join(root,"oversize.json"),handle=await fs.open(oversize,"w");
    await handle.truncate(64*1024*1024+1);await handle.close();
    await assert.rejects(read(oversize),/text-data-source-unavailable/,"oversized JSON is rejected before decoding");
    console.log(JSON.stringify({textDataBoundary:"ok",unicodeChunks:true,quoteChunks:true,knownZero:true,malformedQuotesRejected:true,noRealFilesRead:true}));
  } finally {await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
