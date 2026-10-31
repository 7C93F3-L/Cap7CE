import { randomUUID } from "node:crypto";
import type { LlamaRuntimeProcessState, ModelRuntimeSnapshot } from "../../../core/shared/modelRuntimeTypes";
export class ModelRuntimeState {
 private sequence=0;private readonly epoch=randomUUID();private waiting=new Set<(value:ModelRuntimeSnapshot)=>void>();
 constructor(private state:LlamaRuntimeProcessState){}
 capture<T>(result?:T):ModelRuntimeSnapshot<T>{return{epoch:this.epoch,sequence:this.sequence,state:{...this.state},...(result===undefined?{}:{result})};}
 set(value:LlamaRuntimeProcessState){this.state={...value};this.sequence++;const snapshot=this.capture();for(const resolve of this.waiting)resolve(snapshot);this.waiting.clear();return snapshot.state;}
 wait(epoch:unknown,sequence:unknown):Promise<ModelRuntimeSnapshot>{
  if(typeof epoch!=="string"||!Number.isSafeInteger(sequence)||Number(sequence)<0)throw Error("core-model-runtime-invalid-request");
  if(epoch!==this.epoch||Number(sequence)!==this.sequence)return Promise.resolve(this.capture());
  if(this.waiting.size>=4)throw Error("core-model-runtime-busy");return new Promise(resolve=>this.waiting.add(resolve));
 }
 release(){for(const resolve of this.waiting)resolve(this.capture());this.waiting.clear();}
}
