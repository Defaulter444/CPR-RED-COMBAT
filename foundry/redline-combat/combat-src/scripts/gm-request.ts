import {primaryGM} from "./shared.js";

export interface GMReply {id:string;user:string;gm:string;error?:string}
/** Transport confirmation only. Validation, serialization and retry receipts stay in each workflow. */
export class GMRequests<T=void> {
  private pending=new Map<string,{gm:string;resolve:(value:T)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  request(id:string,emit:()=>void,timeout:number,message:string):Promise<T> {
    const gm=primaryGM()?.id;
    if(!gm)return Promise.reject(Error("Нужен активный Мастер."));
    if(this.pending.has(id))return Promise.reject(Error("Этот запрос уже ждёт подтверждения Мастера."));
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);
        // Missing confirmation never means that the GM cancelled or did not apply the action.
        reject(Error(message));
      },timeout);
      this.pending.set(id,{gm,resolve,reject,timer});
      try{emit();}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error instanceof Error?error:Error(String(error)));}
    });
  }
  reply(reply:GMReply,value:T):void {
    const entry=this.pending.get(reply.id);
    if(!entry||reply.user!==game.user?.id||reply.gm!==entry.gm||reply.gm!==primaryGM()?.id)return;
    clearTimeout(entry.timer);this.pending.delete(reply.id);
    if(reply.error)entry.reject(Error(reply.error));else entry.resolve(value);
  }
}
