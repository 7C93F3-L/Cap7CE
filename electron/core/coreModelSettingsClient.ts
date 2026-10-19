import { coreModelHost } from "./coreModelHost";
// Shell action forwarding only. Discovery, selection validation and persistence belong to Core.
export const requestCoreModelSettings = <T>(operation:string,value:string|null=null):Promise<T>=>coreModelHost().settings<T>(operation,value);
