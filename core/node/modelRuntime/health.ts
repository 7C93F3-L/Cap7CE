import http from "node:http";
const maximumBytes=1024*1024;
async function request(port:number,path:"/health"|"/v1/models",timeout:number,signal?:AbortSignal):Promise<unknown>{
 if(!Number.isInteger(port)||port<18080||port>=18180)return null;
 return new Promise(resolve=>{const agent=new http.Agent({keepAlive:false,proxyEnv:undefined});let ended=false;
  const finish=(value:unknown)=>{if(ended)return;ended=true;clearTimeout(timer);agent.destroy();resolve(value);};
  const request=http.get({hostname:"127.0.0.1",port,path,agent,signal},response=>{
   if(response.statusCode!==200){response.destroy();finish(null);return;}const chunks:Buffer[]=[];let bytes=0;
   response.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>maximumBytes){response.destroy();finish(null);}else chunks.push(chunk);});
   response.on("error",()=>finish(null));response.on("aborted",()=>finish(null));response.on("end",()=>{try{finish(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{finish(null);}});
  });const timer=setTimeout(()=>{request.destroy();finish(null);},timeout);timer.unref();request.on("error",()=>finish(null));
 });
}
export async function healthy(port:number,signal?:AbortSignal){const body=await request(port,"/health",1000,signal) as {status?:unknown}|null;return body?.status==="ok";}
export async function expectedModel(port:number,name:string,signal?:AbortSignal){
 const body=await request(port,"/v1/models",2000,signal) as {models?:unknown;data?:unknown}|null;
 const records=[...(Array.isArray(body?.models)?body.models:[]),...(Array.isArray(body?.data)?body.data:[])];
 return records.some(value=>value&&typeof value==="object"&&[value.name,value.model,value.id].some(v=>typeof v==="string"&&v.toLowerCase()===name.toLowerCase()));
}
