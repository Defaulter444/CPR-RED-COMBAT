const MODULE="redline-combat";
export const BIOMONITOR_KEYS=["eyeHUDDock","crewHUDIntegration","biomonitorShowHP","forcePlayerHUDAnimations","eyeHUDAnimateMessages","biomonitorFlashSeconds","messageAlertSound","messageAlertVolume"];
export const TOKEN_HUD_KEYS=["targetedRightClick","tightHUD","hudScale","iconColor","statusIconScale"];
/** Match Foundry v12 SettingsConfig row data, including native DataField inputs. */
export function nativeSettingRows(keys:readonly string[]):Record<string,unknown>[]{
 return keys.flatMap(key=>{
  const setting=game.settings!.settings.get(`${MODULE}.${key}` as keyof SettingConfig);
  if(!setting||(setting.scope!=="client"&&!game.user?.can("SETTINGS_MODIFY")))return [];
  if(key==="crewHUDIntegration"&&!game.modules?.get("pneuma-crewtools")?.active)return [];
  if(key==="eyeHUDAnimateMessages"&&!game.user?.isGM&&game.settings!.get(MODULE,"forcePlayerHUDAnimations"))return [];
  return [{...setting,id:`${MODULE}.${key}`,key,name:game.i18n!.localize(String(setting.name??"")),hint:game.i18n!.localize(String(setting.hint??"")),value:game.settings!.get(MODULE,key as never),type:setting.type instanceof Function?setting.type.name:"String",isCheckbox:setting.type===Boolean,isSelect:setting.choices!==undefined,isRange:setting.type===Number&&setting.range,isNumber:setting.type===Number,dataField:setting.type instanceof foundry.data.fields.DataField?setting.type:null}];
 });
}
export function positionNotice(root:HTMLElement):void{
 const note=document.createElement("p");note.className="notes";note.dataset.positionConflict="";
 note.textContent="Панель боя справа вверху сдвигает Биомонитор влево вверх. При смене положения панели Биомонитор вернётся на сохранённое место.";
 const update=()=>{const dock=root.querySelector<HTMLSelectElement>('[name="redline-combat.combatBarDock"]')?.value??game.settings!.get(MODULE,"combatBarDock");const biomonitor=root.querySelector<HTMLSelectElement>('[name="redline-combat.eyeHUDDock"]')?.value??game.settings!.get(MODULE,"eyeHUDDock");note.hidden=dock!=="top-right"||biomonitor!=="right";};
 root.querySelector('[data-position-conflict]')?.remove();root.querySelector("footer")?.before(note);root.addEventListener("change",update);update();
}
class DisplaySettings extends FormApplication{
 protected keys:readonly string[]=[];
 constructor(){super({});}
 static override get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{width:480,height:"auto",template:`modules/${MODULE}/combat/templates/combat-bar-settings.hbs`,closeOnSubmit:false,submitOnChange:false,submitOnClose:false}) as typeof FormApplication.defaultOptions;}
 override async getData(){const settings=nativeSettingRows(this.keys);return {settingsHTML:await renderTemplate("templates/sidebar/apps/settings-config-category.html",{id:MODULE,title:this.title,menus:[],settings,count:settings.length})};}
 override activateListeners(html:JQuery){super.activateListeners(html);const root=html[0];if(!root)return;positionNotice(root);let writes=Promise.resolve();root.querySelectorAll<HTMLInputElement|HTMLSelectElement>("input[name],select[name]").forEach(input=>input.addEventListener("change",()=>{
 const key=input.name.slice(MODULE.length+1);if(!this.keys.includes(key))return;
 const setting=game.settings!.settings.get(input.name as keyof SettingConfig);if(!setting||(setting.scope!=="client"&&!game.user?.can("SETTINGS_MODIFY")))return;
 const value=setting.type===Boolean?(input as HTMLInputElement).checked:setting.type===Number?Number(input.value):input.value;
 writes=writes.then(async()=>{await game.settings!.set(MODULE,key as never,value as never);}).catch(error=>{ui.notifications!.error(String(error));this.render(false);});
 }));root.querySelector('[data-close]')?.addEventListener("click",()=>{void this.close();});}
 protected override async _updateObject(_event:Event,_data:Record<string,unknown>){}
}
class BiomonitorSettings extends DisplaySettings{
 protected override keys=BIOMONITOR_KEYS;
 static override get defaultOptions(){return {...super.defaultOptions,id:"pneuma-biomonitor-settings",title:"Биомонитор"};}
 override activateListeners(html:JQuery){
  super.activateListeners(html);if(!game.user?.isGM)return;
  const root=html[0],path=root?.querySelector<HTMLInputElement>('[name="redline-combat.messageAlertSound"]'),volume=root?.querySelector<HTMLInputElement>('[name="redline-combat.messageAlertVolume"]');
  if(!path||!volume)return;
  const browse=document.createElement("button");browse.type="button";browse.title="Выбрать звук уведомления";browse.innerHTML='<i class="fas fa-file-audio" aria-hidden="true"></i>';browse.setAttribute("aria-label",browse.title);
  browse.addEventListener("click",()=>{new FilePicker({type:"audio",current:path.value,callback:value=>{path.value=value;path.dispatchEvent(new Event("change",{bubbles:true}));}}).render(true);});path.after(browse);
  const play=document.createElement("button");play.type="button";play.innerHTML='<i class="fas fa-play" aria-hidden="true"></i> Прослушать';
  play.addEventListener("click",async()=>{const src=path.value.trim();if(!src){ui.notifications!.warn("Выберите звуковой файл для прослушивания.");return;}play.disabled=true;
   try{await foundry.audio.AudioHelper.play({src,volume:Math.min(1,Math.max(0,Number(volume.value))),loop:false},false);}catch(error){ui.notifications!.error("Не удалось воспроизвести звук: "+String(error));}finally{play.disabled=false;}
  });volume.closest(".form-fields")?.append(play);
 }
}
class TokenHUDSettings extends DisplaySettings{protected override keys=TOKEN_HUD_KEYS;static override get defaultOptions(){return {...super.defaultOptions,id:"pneuma-token-hud-settings",title:"Меню токена"};}}
export function registerDisplaySettings(){
 for(const key of [...BIOMONITOR_KEYS,...TOKEN_HUD_KEYS]){const setting=game.settings!.settings.get(`${MODULE}.${key}` as keyof SettingConfig);if(setting)setting.config=false;}
 game.settings!.registerMenu(MODULE,"biomonitorSettings",{name:"Биомонитор",label:"Настроить",hint:"Положение, числа HP, интеграция и анимации.",icon:"fas fa-heart-pulse",type:BiomonitorSettings,restricted:false});
 game.settings!.registerMenu(MODULE,"tokenHUDSettings",{name:"Меню токена",label:"Настроить",hint:"Размер, отступы, цвет значков и действие правой кнопки.",icon:"fas fa-sliders",type:TokenHUDSettings,restricted:false});
}
