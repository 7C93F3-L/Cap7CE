import net from "node:net";
import { firstPort,portCount,runtimeHost } from "./policy";
import type { ModelRuntimeLog } from "./log";
const probe=(port:number,signal:AbortSignal)=>new Promise<boolean>(resolve=>{
 const server=net.createServer(socket=>socket.destroy());server.unref();let settled=false;
 const finish=(value:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener("abort",cancel);server.close(()=>{});resolve(value);};
 const cancel=()=>finish(false),timer=setTimeout(cancel,1000);timer.unref();signal.addEventListener("abort",cancel,{once:true});
 server.once("error",()=>finish(false));server.listen({host:runtimeHost,port,exclusive:true},()=>{if(settled){server.close();return;}finish(true);});
 if(signal.aborted)cancel();
});
export async function findModelPort(offset:number,signal:AbortSignal,log:ModelRuntimeLog){
 for(let index=offset;index<portCount;index++){signal.throwIfAborted();const port=firstPort+index;
  if(await probe(port,signal)){await log.append("端口探测成功："+runtimeHost+":"+port);return{port,nextOffset:index+1};}
  await log.append("端口探测失败："+runtimeHost+":"+port);
 }return null;
}
