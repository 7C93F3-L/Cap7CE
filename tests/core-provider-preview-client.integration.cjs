const assert=require('node:assert/strict'),Module=require('node:module');
const calls=[],pending=[],original=Module._load;
Module._load=function(request,parent,isMain){if(request==='./coreProviderPreviewHost')return{requestCoreProviderPreview:(method,args,passive)=>{calls.push({method,args,passive});if(passive)return Promise.resolve(true);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};return original.call(this,request,parent,isMain);};
const {CoreProviderPreviewClient,providerPreviewFailure}=require('../dist-electron/core/coreProviderPreviewClient.js');Module._load=original;
(async()=>{
 const client=new CoreProviderPreviewClient('epub',value=>typeof value==='string');assert.equal(client.close(),false);assert.equal(calls.length,0);
 const first=client.open('first','X:\\a.epub'),second=client.open('second','X:\\b.epub');void first.catch(()=>{});pending[1].resolve('new');assert.equal(await second,'new');pending[0].reject(Error('old parser failure'));await assert.rejects(first,error=>error.code==='ECANCELED');assert.equal(client.close(),false);
 const held=client.open('held','X:\\a.epub');assert.equal(client.close('foreign'),false);assert.equal(client.close('held'),true);assert.equal(calls.at(-1).method,'epub.close');assert.equal(calls.at(-1).passive,true);pending[2].resolve('late');await assert.rejects(held,error=>error.code==='ECANCELED');
 const invalid=client.open('invalid','X:\\a.epub');pending[3].resolve({arbitrary:true});await assert.rejects(invalid,/invalid-response/);
 const pdf=new CoreProviderPreviewClient('pdf',value=>typeof value==='string',undefined,true),opened=pdf.open('pdf','X:\\a.pdf');pending[4].resolve('metadata');await opened;const current=pdf.guard('pdf');assert.equal(current(),true);assert.equal(pdf.close('pdf'),true);assert.equal(current(),false);
 assert.equal(providerPreviewFailure(Object.assign(Error('timeout'),{code:'ETIMEDOUT'}),(reason,message)=>Object.assign(Error(message),{reason})).reason,'timedOut');assert.equal(providerPreviewFailure(Object.assign(Error('locked'),{code:'preview:encrypted'}),(reason,message)=>Object.assign(Error(message),{reason})).reason,'encrypted');
 const projection=require('../dist-electron/core/coreProviderPreviewProjection.js');assert.equal(projection.validBookPreview({title:'a',creator:'',chapters:[],navigationCount:0,skippedChapterCount:0,truncated:false,coverDataUrl:'https://remote.invalid/cover'}),false);assert.equal(projection.validPdfPreview({pageCount:1,defaultPageWidth:0,defaultPageHeight:10}),false);
 console.log('Shell preview projection: passive close, exact-session cancellation, retired errors/results, invalid replies, PDF render generation and typed failures passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
