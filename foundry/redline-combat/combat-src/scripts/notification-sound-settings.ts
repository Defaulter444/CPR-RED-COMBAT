const M="redline-combat";
export class NotificationSoundSettings extends FormApplication {
  constructor(){super({});}
  static override get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{title:"Индикатор хода — звуки",id:"pneuma-notification-sounds",width:500,height:"auto",template:"modules/redline-combat/combat/templates/notification-sounds.hbs"}) as typeof FormApplication.defaultOptions;}
  override getData(){return {sounds:[
    {label:"Ваш ход",pathKey:"yourTurnSound",volumeKey:"yourTurnVolume",path:game.settings!.get(M,"yourTurnSound"),volume:game.settings!.get(M,"yourTurnVolume")}
  ]};}
  override activateListeners(html:JQuery){
    super.activateListeners(html);
    html[0]?.querySelectorAll<HTMLButtonElement>("[data-play-sound]").forEach(button=>button.addEventListener("click",async()=>{
      if(!game.user?.isGM)return;
      const row=button.closest("fieldset")!;
      const src=row.querySelector<HTMLInputElement>('input[type="text"]')!.value.trim();
      const volume=Number(row.querySelector<HTMLInputElement>('input[type="range"]')!.value);
      if(!src){ui.notifications!.warn("Выберите звуковой файл для прослушивания.");return;}
      button.disabled=true;
      try{await foundry.audio.AudioHelper.play({src,volume:Math.min(1,Math.max(0,volume)),loop:false},false);}
      catch(error){ui.notifications!.error("Не удалось воспроизвести звук: "+(error as Error).message);}
      finally{button.disabled=false;}
    }));
  }
  protected override async _updateObject(_event:Event,data:Record<string,unknown>){
    if(!game.user?.isGM)throw Error("Настраивать звуки уведомлений может только Мастер.");
    for(const key of ["yourTurnSound"] as const)await game.settings!.set(M,key,String(data[key]??"").trim());
    for(const key of ["yourTurnVolume"] as const){const volume=Number(data[key]);if(!Number.isFinite(volume))throw Error("Некорректная громкость.");await game.settings!.set(M,key,Math.min(1,Math.max(0,volume)));}
  }
}
export function registerNotificationSoundSettings():void {
  game.settings!.registerMenu(M,"notificationSounds",{name:"Звук «Ваш ход»",label:"Настроить звук",hint:"Выберите звук хода, громкость и прослушайте у себя. Звуки всплывающих сообщений — в настройках Биомонитора.",icon:"fas fa-volume-high",type:NotificationSoundSettings,restricted:true});
}
