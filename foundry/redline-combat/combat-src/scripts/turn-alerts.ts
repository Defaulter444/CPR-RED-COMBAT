import {playNotificationSound} from "./notification-sounds.js";
import {displayedEncounter} from "./encounter.js";
import {postHUDMessage} from "./hud-messages.js";
import {updateTouchesPath} from "./update-path.js";
const M="redline-combat";
declare global {interface SettingConfig {
  "redline-combat.nextTurnMarker":boolean;
  "redline-combat.turnPopups":boolean;
}}
/** Follow native turn ordering and the encounter's skip-defeated policy, including wraparound. */
export function nextCombatant(combat:Combat):Combatant|undefined {
  const turns=combat.turns, index=combat.turn;
  if(!combat.started||index===null||index<0||turns.length<2)return;
  for(let step=1;step<turns.length;step++){
    const row=turns[(index+step)%turns.length];
    if(row&&(!combat.settings.skipDefeated||!row.isDefeated))return row;
  }
}
let marker:{token:Token;art:PIXI.Container;frame:(phase:number)=>void;ticker:PIXI.Ticker;tick:(delta:number)=>void;key:string;running:boolean}|undefined;
let watchedToken:Token|undefined;
function clearNextMarker(){if(!marker)return;marker.ticker.remove(marker.tick);marker.art.destroy({children:true});marker=undefined;}
export function refreshNextTurnMarker():void {
  const combat=displayedEncounter(),next=combat&&nextCombatant(combat);
  const token=next?.tokenId?canvas.tokens?.get(next.tokenId):undefined;
  watchedToken=token;
  if(!canvas.ready||!canvas.app||!game.settings!.get(M,"turnMarkerEnabled")||!game.settings!.get(M,"nextTurnMarker")
    ||game.settings!.get(M,"turnMarkerDisplay")==="off"||!next?.visible||next.sceneId!==canvas.scene?.id
    ||!token||["container", "blackIce", "demon"].includes(String(token.actor?.type))||token.destroyed||token.isPreview||!token.visible||(!game.user?.isGM&&(token.document.hidden||token.document.isSecret))){clearNextMarker();return;}
  const grid=Number(canvas.scene!.grid.size)||100,key=[token.w,token.h,grid].join(":");
  if(marker?.token!==token||marker.key!==key||marker.art.destroyed){
    clearNextMarker();const art=new PIXI.Container();
    const radius=Math.max(token.w,token.h)/2+grid*.035,spread=grid*.22;
    const rings=Array.from({length:3},()=>{
      const ring=new PIXI.Graphics();
      ring.lineStyle(Math.max(1,grid*.012),0xffc36a,1).drawCircle(0,0,radius);
      art.addChild(ring);return ring;
    });
    const frame=(phase:number)=>{
      rings.forEach((ring,index)=>{
        const progress=(phase+index/3)%1;
        ring.scale.set(1+spread*progress/radius);
        ring.alpha=.28*Math.sin(Math.PI*progress);
      });
    };
    art.position.set(token.w/2,token.h/2);token.addChildAt(art,0);frame(.12);
    let phase=.12;
    const tick=(delta:number)=>{if(document.hidden||!token.visible||!token.renderable)return;phase=(phase+Math.min(delta/60,.1)/5)%1;frame(phase);};
    marker={token,art,frame,ticker:canvas.app.ticker,tick,key,running:false};
  }
  const animate=game.settings!.get(M,"turnMarkerDisplay")==="animated"&&!document.hidden;
  if(animate!==marker.running){marker.running=animate;if(animate)marker.ticker.add(marker.tick);else{marker.ticker.remove(marker.tick);marker.frame(.12);}}
}
const seen=new Map<string,string>();
const turnKey=(combat:Combat)=>[combat.started,combat.round,combat.turn,combat.combatant?.id].join(":");
const owned=(row:Combatant|undefined)=>!!row?.visible&&!["container", "blackIce", "demon"].includes(String(row.actor?.type))&&!!row.actor?.testUserPermission(game.user!,"OWNER")
  &&!row.token?.hidden&&!row.token?.isSecret;
export function notifyTurnChange(combat:Combat):void {
  const key=turnKey(combat),previous=seen.get(combat.id!);seen.set(combat.id!,key);
  if(previous===undefined||previous===key||!combat.started||game.user?.isGM||!combat.active)return;
  const current=owned(combat.combatant??undefined),next=owned(nextCombatant(combat));
  if(!current&&!next)return;
  if(game.settings!.get(M,"turnPopups"))postHUDMessage({source:"pneuma-turn-alert",id:current?"current-turn":"next-turn",text:current?"Ваш ход!":"Следующий ход — ваш",mode:"flash",duration:4,suppressDefaultSound:current});
  if(current)playNotificationSound("turn");
}
export function registerTurnAlerts():void {
  let frame=0;
  const refresh=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;refreshNextTurnMarker();});};
  game.settings!.register(M,"nextTurnMarker",{name:"Индикатор следующего хода",hint:"Три тонких кольца расходятся вокруг следующего участника. Учитывает видимость индикатора и статичный режим.",scope:"client",config:true,type:Boolean,default:true,onChange:refreshNextTurnMarker});
  game.settings!.register(M,"turnPopups",{name:"Всплывающие уведомления о ходе",hint:"Всплывающие уведомления, когда начинается или приближается ваш ход. Только у игроков; в список сообщений HUD ничего не добавляется.",scope:"client",config:true,type:Boolean,default:true});
  const remember=(combat:Combat)=>seen.set(combat.id!,turnKey(combat));
  Hooks.on("ready",()=>{for(const combat of game.combats??[])remember(combat);refresh();});
  Hooks.on("createCombat",remember);
  Hooks.on("updateCombat",(combat:Combat,changes:object)=>{
    notifyTurnChange(combat);
    if(["round","turn","active","scene","settings"].some(path=>updateTouchesPath(changes,path)))refresh();
  });
  Hooks.on("deleteCombat",(combat:Combat)=>{seen.delete(combat.id!);refresh();});
  for(const hook of ["canvasReady","createCombatant","updateCombatant","deleteCombatant","updateUser"])Hooks.on(hook,refresh);
  Hooks.on("updateSetting",(setting:{key?:string})=>{if(setting.key?.startsWith(M+".turnMarker")||setting.key===M+".nextTurnMarker")refresh();});
  Hooks.on("updateActor",(actor:Actor)=>{if(actor.uuid===watchedToken?.actor?.uuid)refresh();});
  Hooks.on("updateToken",(token:TokenDocument)=>{if(token===watchedToken?.document)refresh();});
  for(const hook of ["drawToken","refreshToken"])Hooks.on(hook,(token:Token)=>{if(token.document===watchedToken?.document)refresh();});
  Hooks.on("destroyToken",(token:Token)=>{if(marker?.token===token)clearNextMarker();});
  Hooks.on("canvasTearDown",()=>{cancelAnimationFrame(frame);frame=0;watchedToken=undefined;clearNextMarker();});
  document.addEventListener("visibilitychange",refresh);
}


