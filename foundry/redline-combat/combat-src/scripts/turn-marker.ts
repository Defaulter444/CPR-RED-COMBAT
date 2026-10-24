import {tokenPositionOnly} from "./update-path.js";
import {viewedTokenIndicator,viewerDefaultIndicator,type IndicatorProfile} from "./turn-marker-profile.js";
import {displayedEncounter} from "./encounter.js";
import {createMarkerArt,MARKER_STYLES,type MarkerStyle} from "./turn-marker-art.js";
const M="redline-combat",DEFAULT_COLOR="#ffc36a";
declare global {interface SettingConfig {
  "redline-combat.turnMarkerEnabled":boolean;
  "redline-combat.turnMarkerForceDefault":boolean;
  "redline-combat.turnMarkerStyle":"off"|MarkerStyle;
  "redline-combat.turnMarkerColor":string|null;
  "redline-combat.turnMarkerThickness":number;
  "redline-combat.turnMarkerDistance":number;
  "redline-combat.turnMarkerOpacity":number;
  "redline-combat.turnMarkerSpeed":number;
  "redline-combat.turnMarkerDisplay":"animated"|"static"|"off";
}}
const bounded=(n:number,min:number,max:number,fallback:number)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
let current:{token:Token;key:string;art:ReturnType<typeof createMarkerArt>;ticker:PIXI.Ticker;tick:(delta:number)=>void;running:boolean}|undefined;
let targetId:string|undefined;
const previews=new Map<object,{token:TokenDocument;profile:IndicatorProfile}>();
export function previewTurnMarker(owner:object,token:TokenDocument|undefined,profile:IndicatorProfile):void{
  if(token)previews.set(owner,{token,profile});else previews.delete(owner);
  refreshTurnMarker();
}
export function endTurnMarkerPreview(owner:object):void{previews.delete(owner);refreshTurnMarker();}
function clear(){
  if(!current)return;
  current.ticker.remove(current.tick);
  if(!current.art.root.destroyed)current.art.root.destroy({children:true});
  current=undefined;
}
export function refreshTurnMarker(){
  if(!canvas.ready||!canvas.app||!game.settings!.get(M,"turnMarkerEnabled")){clear();targetId=undefined;return;}
  const combat=displayedEncounter(),combatant=combat?.combatant;
  const preview=[...previews.values()].at(-1);
  targetId=preview?.token.id??combatant?.tokenId??undefined;
  const token=targetId?canvas.tokens?.get(targetId):undefined;
  const profile=preview?.profile??(game.settings!.get(M,"turnMarkerForceDefault")?viewerDefaultIndicator():viewedTokenIndicator(token?.document));
  const style=profile.turnMarkerStyle,display=game.settings!.get(M,"turnMarkerDisplay");
  if(!token||["container", "blackIce", "demon"].includes(String(token.actor?.type))||token.destroyed||token.isPreview||!token.visible
    ||(preview?(token.document!==preview.token||(!game.user?.isGM&&!token.isOwner)):(combatant?.sceneId!==canvas.scene?.id||!combatant?.visible))
    ||(!game.user?.isGM&&(token.document.hidden||token.document.isSecret))||style==="off"||display==="off") {clear();return;}
  const saved=profile.turnMarkerColor,color=Number.parseInt((/^#[0-9a-f]{6}$/i.test(saved??"")?saved!:DEFAULT_COLOR).slice(1),16);
  const grid=Number(canvas.scene!.grid.size)||100;
  const thickness=bounded(profile.turnMarkerThickness,1,10,2)*grid/100;
  const opacity=bounded(profile.turnMarkerOpacity,.5,1,.85);
  const speed=bounded(profile.turnMarkerSpeed,0,2,1);
  if(!opacity){clear();return;}
  const distance=bounded(profile.turnMarkerDistance,0,50,8);
  const radius=Math.max(token.w,token.h)/2+grid*distance/100+thickness/2;
  const key=JSON.stringify([style,color,thickness,opacity,speed,distance,token.w,token.h]);
  if(current?.token!==token||current.key!==key||current.art.root.destroyed){
    clear();
    const art=createMarkerArt(radius,{style,color,thickness,opacity,speed});
    art.root.position.set(token.w/2,token.h/2);token.addChildAt(art.root,0);
    let elapsed=0,phase=.08;
    const tick=(delta:number)=>{
      if(!token.visible||!token.renderable||document.hidden)return;
      elapsed+=delta/60;if(elapsed<1/30)return;
      phase+=Math.min(elapsed,.1)*speed/4;elapsed=0;art.frame(phase);
    };
    current={token,key,art,ticker:canvas.app.ticker,tick,running:false};
  }
  const animate=display==="animated"&&speed>0&&!document.hidden;
  if(animate!==current.running){
    current.running=animate;
    if(animate)current.ticker.add(current.tick);else current.ticker.remove(current.tick);
  }
}
export function registerTurnMarker(){
  game.settings!.register(M,"turnMarkerEnabled",{name:"Индикатор хода",hint:"Показывать индикаторы хода на этом компьютере. Если выключить, все индикаторы скрываются.",scope:"client",config:true,type:Boolean,default:true,onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerForceDefault",{name:"Индикатор по умолчанию для всех",hint:"Показывать индикатор по умолчанию для всех участников на этом компьютере, включая своего персонажа.",scope:"client",config:true,type:Boolean,default:false,onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerStyle",{name:"Стиль индикатора по умолчанию",hint:"Подсвечивает текущего участника на активной сцене. Если пользуетесь им, выключите подсветку боя в Monk's.",scope:"world",config:false,type:String,default:"segmented",choices:{off:"Выкл.",...MARKER_STYLES},onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerColor",{name:"Цвет индикатора",hint:"Пусто — янтарный (#ffc36a).",scope:"world",config:false,default:DEFAULT_COLOR,
    // @ts-expect-error Foundry v12 accepts DataField instances; allow blanks before native validation.
    type:new foundry.data.fields.ColorField({nullable:true,blank:true,initial:DEFAULT_COLOR}),onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerThickness",{name:"Толщина индикатора",hint:"Масштабируется вместе с сеткой сцены и зумом.",scope:"world",config:false,type:Number,default:2,range:{min:1,max:10,step:.5},onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerDistance",{name:"Размер индикатора",hint:"Размер контура вокруг токена. Чем больше, тем дальше за краем токена.",scope:"world",config:false,type:Number,default:8,range:{min:0,max:50,step:1},onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerOpacity",{name:"Непрозрачность индикатора",scope:"world",config:false,type:Number,default:.85,range:{min:.5,max:1,step:.05},onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerSpeed",{name:"Скорость индикатора",hint:"1 — один цикл за четыре секунды. 0 — без движения.",scope:"world",config:false,type:Number,default:1,range:{min:0,max:2,step:.25},onChange:refreshTurnMarker});
  game.settings!.register(M,"turnMarkerDisplay",{name:"Отображение индикатора хода",scope:"client",config:true,type:String,default:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"static":"animated",choices:{animated:"Анимированный",static:"Статичный"},onChange:refreshTurnMarker});
  for(const event of ["updateUser","createUser","deleteUser","updateActor","canvasReady","createCombat","updateCombat","deleteCombat","createCombatant","updateCombatant","deleteCombatant"])Hooks.on(event,refreshTurnMarker);
  Hooks.on("updateToken",(doc:TokenDocument,changes?:Record<string,unknown>)=>{
    if(doc.id!==targetId&&doc!==current?.token.document)return;
    if(changes&&tokenPositionOnly(changes))return;
    refreshTurnMarker();
  });
  Hooks.on("ready",async()=>{
    if(game.settings!.get(M,"turnMarkerDisplay")==="off"){
      await game.settings!.set(M,"turnMarkerEnabled",false);
      await game.settings!.set(M,"turnMarkerDisplay",window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"static":"animated");
    }
    if(game.user?.isGM&&game.settings!.get(M,"turnMarkerStyle")==="circuit")await game.settings!.set(M,"turnMarkerStyle","netrunner");refreshTurnMarker();});
  Hooks.on("canvasTearDown",()=>{previews.clear();clear();targetId=undefined;});
  const rendered = new WeakMap<Token,string>();
  Hooks.on("drawToken",(token:Token)=>{rendered.delete(token);if(token.id===targetId)refreshTurnMarker();});
  Hooks.on("refreshToken",(token:Token)=>{
    if(token.id!==targetId&&token!==current?.token)return;
    const state=JSON.stringify([token.visible,token.isPreview,token.destroyed,token.w,token.h,token.document.hidden,token.document.isSecret]);
    if(rendered.get(token)===state&&(!current||!current.art.root.destroyed))return;
    rendered.set(token,state);refreshTurnMarker();
  });
  Hooks.on("destroyToken",(token:Token)=>{for(const [owner,preview] of previews)if(preview.token===token.document)previews.delete(owner);if(token===current?.token)clear();});
  document.addEventListener("visibilitychange",refreshTurnMarker);
}
