import {APPEARANCE_KEYS,indicatorForActor,tokenIndicator,saveTokenIndicator,defaultIndicator,personalIndicator,savePersonalIndicator,INDICATOR_MODULE as MODULE,type AppearanceKey} from "./turn-marker-profile.js";
import {MARKER_STYLES} from "./turn-marker-art.js";
import {previewTurnMarker,endTurnMarkerPreview} from "./turn-marker.js";
import {normalizeIndicator,localDefaultOverride,viewerDefaultIndicator,saveLocalDefaultIndicator} from "./turn-marker-profile.js";
const LOCAL_KEYS=["turnMarkerDisplay","turnMarkerEnabled","turnMarkerForceDefault"] as const;
export const TURN_MARKER_KEYS=[...APPEARANCE_KEYS,...LOCAL_KEYS] as const;
const isLocal=(key:string)=>LOCAL_KEYS.some(local=>local===key);
type MarkerKey=typeof TURN_MARKER_KEYS[number];
export type IndicatorMode="default"|"personal"|"token";
export async function saveTurnMarkerSetting(id:string,value:string|boolean,mode:IndicatorMode="personal",token?:TokenDocument):Promise<void>{
 const key=id.slice(MODULE.length+1) as MarkerKey;
 if(!id.startsWith(MODULE+".")||!TURN_MARKER_KEYS.includes(key))throw Error("Неизвестная настройка индикатора хода.");
 if(!isLocal(key)&&mode==="token"&&!game.user?.isGM)throw Error("Индикатор токена может менять только Мастер.");
 const config=game.settings!.settings.get(id as keyof SettingConfig)!;
 let normalized:string|number|boolean=value;
 if(config.type===Boolean){if(typeof value!=="boolean")return;}
 else if(typeof value!=="string")return;
 else if(config.type===Number){normalized=Number(value);if(!Number.isFinite(normalized)||!value.trim())return;const range=config.range as unknown as {min:number;max:number};normalized=Math.min(range.max,Math.max(range.min,normalized));}
 else if(key==="turnMarkerColor"){normalized=value.trim()||"#ffc36a";if(!/^#[0-9a-f]{6}$/i.test(normalized))return;}
 else if(config.choices&&!Object.hasOwn(config.choices,value))return;
 if(isLocal(key)||(mode==="default"&&game.user?.isGM)){
  if(game.settings!.get(MODULE,key)!==normalized)await game.settings!.set(MODULE,key,normalized as never);
 }else if(mode==="default"){
  await saveLocalDefaultIndicator({...viewerDefaultIndicator(),[key]:normalized});
 }else if(mode==="token"){
  const profile=tokenIndicator(token)??indicatorForActor(token?.actor??undefined);
  await saveTokenIndicator(token,{...profile,[key]:normalized});
 }else{
  const saved=personalIndicator(game.user),profile=saved??viewerDefaultIndicator();
  if(!saved||profile[key as AppearanceKey]!==normalized)await savePersonalIndicator({...profile,[key]:normalized});
 }
}
export class TurnMarkerSettings extends FormApplication{
 private mode:IndicatorMode=game.user?.isGM?"default":"personal";
 private writes:Promise<void>=Promise.resolve();
 private token?:TokenDocument;
 private previewToken?:TokenDocument;
 private selectionHook?:number;
 constructor(token?:TokenDocument){super({});this.previewToken=token;this.token=game.user?.isGM?(token??(canvas.tokens?.controlled?.length===1?canvas.tokens.controlled[0]?.document:undefined)):undefined;if(this.token)this.mode="token";}
 async showToken(token?:TokenDocument):Promise<void>{await this.writes;this.previewToken=token;this.token=game.user?.isGM?token:undefined;this.mode=this.token?"token":game.user?.isGM?"default":"personal";this.render(true,{focus:true});}
 private updatePreview(root:HTMLElement):void{
  const allowed=(token:Token|undefined)=>token&&!token.destroyed&&token.visible&&(game.user?.isGM||(token.isOwner&&!token.document.hidden&&!token.document.isSecret));
  const explicit=this.mode==="token"?this.token:this.previewToken;
  const candidate=explicit?.id?canvas.tokens?.get(explicit.id):undefined;
  const token=allowed(candidate)&&candidate?.document===explicit?candidate:canvas.tokens?.controlled?.find(allowed)??canvas.tokens?.placeables?.find(token=>allowed(token)&&token.actor?.id===game.user?.character?.id);
  const raw:Record<string,unknown>={};
  for(const key of APPEARANCE_KEYS){const value=root.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${MODULE}.${key}"]`)?.value;raw[key]=key==="turnMarkerStyle"||key==="turnMarkerColor"?value:Number(value);}
  previewTurnMarker(this,token?.document,normalizeIndicator(raw));
 }
 override async close(options?:Parameters<FormApplication["close"]>[0]){if(this.selectionHook!==undefined)Hooks.off("controlToken",this.selectionHook);this.selectionHook=undefined;endTurnMarkerPreview(this);return super.close(options);}
 static override get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{title:"Индикатор хода",id:"pneuma-turn-marker-settings",width:480,height:"auto",closeOnSubmit:false,submitOnChange:false,submitOnClose:false,template:"modules/redline-combat/combat/templates/turn-marker-settings.hbs"}) as typeof FormApplication.defaultOptions;}
 override async getData(){
  const personal=personalIndicator(game.user),override=tokenIndicator(this.token),profile=this.mode==="token"?(override??indicatorForActor(this.token?.actor??undefined)):this.mode==="personal"?(personal??viewerDefaultIndicator()):(game.user?.isGM?defaultIndicator():viewerDefaultIndicator());
  return {isGM:!!game.user?.isGM,useGMDefault:!localDefaultOverride(),hasToken:!!game.user?.isGM,isToken:this.mode==="token",tokenName:this.token?.name,useInherited:!override,profile,isDefault:this.mode==="default",isPersonal:this.mode==="personal",readOnly:this.mode==="token"&&!game.user?.isGM,useDefault:!personal,styles:{off:"Выкл.",...MARKER_STYLES},ranges:APPEARANCE_KEYS.filter(key=>!["turnMarkerStyle","turnMarkerColor"].includes(key)).map(key=>{const config=game.settings!.settings.get(`${MODULE}.${key}`)!;return {key,label:config.name,value:profile[key],displayValue:key==="turnMarkerOpacity"?Math.round(Number(profile[key])*100)+"%":profile[key],range:config.range};})};
 }
 override activateListeners(html:JQuery){
  super.activateListeners(html);const root=html[0];if(!root)return;
  if(this.selectionHook===undefined)this.selectionHook=Hooks.on("controlToken",(token:Token,controlled:boolean)=>{
   if(!controlled)return;
   this.writes=this.writes.then(async()=>{
    if(this.selectionHook===undefined)return;
    this.previewToken=token.document;
    if(game.user?.isGM)this.token=token.document;
    this.render(false);
   });
  });
  this.updatePreview(root);
  const queue=(fn:()=>Promise<void>)=>{this.writes=this.writes.then(fn).catch(error=>{ui.notifications!.error(String(error));void this.render(false);});};
  root.querySelectorAll<HTMLButtonElement>("[data-indicator-mode]").forEach(button=>button.addEventListener("click",()=>{queue(async()=>{this.mode=button.dataset.indicatorMode as IndicatorMode;this.render(false);});}));
  root.querySelector<HTMLInputElement>("[data-use-default]")?.addEventListener("change",event=>{const checked=(event.target as HTMLInputElement).checked;queue(async()=>{if(checked)await savePersonalIndicator(null);else await savePersonalIndicator(viewerDefaultIndicator());this.render(false);});});
  root.querySelector<HTMLInputElement>("[data-use-gm-default]")?.addEventListener("change",event=>{const checked=(event.target as HTMLInputElement).checked;queue(async()=>{await saveLocalDefaultIndicator(checked?null:defaultIndicator());this.render(false);});});
  const targetToken=this.token;
  root.querySelector<HTMLInputElement>("[data-use-inherited]")?.addEventListener("change",event=>{const checked=(event.target as HTMLInputElement).checked;queue(async()=>{await saveTokenIndicator(targetToken,checked?null:indicatorForActor(targetToken?.actor??undefined));this.render(false);});});
  const pending=new Map<string,{id:string;value:string|boolean;mode:IndicatorMode}>();let draining=false;
  const apply=(event:Event)=>{
   const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLSelectElement)||input.disabled)return;
   const id=input.dataset.edit||input.name;if(!id)return;
   const value=input instanceof HTMLInputElement&&input.type==="checkbox"?input.checked:input.value,mode=this.mode;
   if(input.type==="range"){const label=input.parentElement?.querySelector(".range-value");if(label)label.textContent=id.endsWith("turnMarkerOpacity")?Math.round(Number(value)*100)+"%":String(value);}
   if(id.endsWith("turnMarkerColor")&&!input.dataset.edit){const color=String(value).trim()||"#ffc36a";if(/^#[0-9a-f]{6}$/i.test(color)){const picker=root.querySelector<HTMLInputElement>(`input[data-edit="${id}"]`);if(picker)picker.value=color;}}
   if(input.dataset.edit){const text=root.querySelector<HTMLInputElement>(`input[name="${input.dataset.edit}"]`);if(text)text.value=String(value);}
   if(mode==="personal"&&!isLocal(id.slice(MODULE.length+1))){const toggle=root.querySelector<HTMLInputElement>("[data-use-default]");if(toggle)toggle.checked=false;}
   if(mode==="token"&&!isLocal(id.slice(MODULE.length+1))){const toggle=root.querySelector<HTMLInputElement>("[data-use-inherited]");if(toggle)toggle.checked=false;}
   if(mode==="default"&&!game.user?.isGM){const toggle=root.querySelector<HTMLInputElement>("[data-use-gm-default]");if(toggle)toggle.checked=false;}
   pending.set(mode+id,{id,value,mode});
   this.updatePreview(root);
   if(!draining){draining=true;queue(async()=>{try{while(pending.size){const [key,edit]=pending.entries().next().value!;pending.delete(key);await saveTurnMarkerSetting(edit.id,edit.value,edit.mode,targetToken);}}finally{draining=false;pending.clear();}});}
  };
  root.addEventListener("input",apply);root.addEventListener("change",apply);
  root.querySelector("[data-close]")?.addEventListener("click",()=>{void this.close();});
 }
 protected override async _updateObject(_event:Event,_data:Record<string,unknown>){}
}
let editor:TurnMarkerSettings|undefined;
export function openTurnMarkerSettings(token?:TokenDocument):void{editor??=new TurnMarkerSettings();void editor.showToken(token);}

export function registerTurnMarkerSettings():void{
 game.settings!.registerMenu(MODULE,"turnMarkerSettings",{name:"Индикатор хода",label:"Настроить",hint:"Индикатор по умолчанию, мой индикатор и правки Мастера для токенов. Изменения сохраняются автоматически.",icon:"fas fa-circle-notch",type:TurnMarkerSettings,restricted:false});
}
