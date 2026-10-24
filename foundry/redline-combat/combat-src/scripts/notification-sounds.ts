const M="redline-combat";
declare global {interface SettingConfig {
  "redline-combat.messageAlertSound":string;
  "redline-combat.messageAlertVolume":number;
  "redline-combat.yourTurnSound":string;
  "redline-combat.yourTurnVolume":number;
}}
export function playNotificationSound(kind:"message"|"turn"):void {
  const src=game.settings!.get(M,kind==="turn"?"yourTurnSound":"messageAlertSound");
  const volume=game.settings!.get(M,kind==="turn"?"yourTurnVolume":"messageAlertVolume");
  if(typeof src!=="string"||!src.trim()||!Number.isFinite(volume)||volume<=0)return;
  void foundry.audio.AudioHelper.play({src,volume:Math.min(1,volume),loop:false},false)
    .catch(error=>console.warn(M,"Notification sound unavailable",error));
}
export function registerNotificationSounds():void {
  for(const [key,label,file,volumeKey,volume] of [
    ["messageAlertSound","Звук всплывающего сообщения","message-alert","messageAlertVolume",.4],
    ["yourTurnSound","Звук «Ваш ход»","your-turn","yourTurnVolume",.65]
  ] as const){
    game.settings!.register(M,key,{name:label,hint:"Звуковой файл выбирает Мастер. Пусто — без звука. Звучит только у получателя.",scope:"world",config:false,type:String,default:`modules/${M}/combat/sounds/${file}.wav`});
    game.settings!.register(M,volumeKey,{name:label+": громкость",hint:"0 — без звука.",scope:"world",config:false,type:Number,default:volume,range:{min:0,max:1,step:.05}});
  }
}
