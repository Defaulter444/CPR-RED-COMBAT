import {markHomebrew} from "./homebrew-badge.js";
import {empBehavior,normalizeEmpBehavior} from "./emp-behavior.js";
const MODULE="redline-combat";
export class EmpSettingsForm extends FormApplication {
  constructor(){super({});}
  static override get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{
    title:"Действие ЭМИ",id:"pneuma-emp-settings",width:530,height:"auto",resizable:false,
    template:"modules/redline-combat/combat/templates/emp-settings.hbs",closeOnSubmit:true,
  }) as typeof FormApplication.defaultOptions;}
  override getData(){
    const values=empBehavior();
    const immunity=String(game.settings!.get(MODULE,"empImmunity")??"");
    return {...values,frameConfigured:values.frameNoMove||values.frameReduceMove||values.frameActionPenalty,protectionConfigured:values.hardened!=="exclude"||!!immunity.trim(),foundationWeights:{equal:"Обычный вес","foundation-more":"Вес ×2","foundation-less":"Вес ½"},hardenedMethods:{exclude:"Исключить из выбора",consume:"Включить; выбор не даёт эффекта"},profiles:(["gm","player"] as const).map(side=>({
      side,title:side==="gm"?"Когда выбирает Мастер":"Когда выбирает игрок",...values[side],
      methods:side==="gm"?{manual:"Мастер выбирает",random:"Случайно"}:{manual:"Выбор из всех предметов",shortlist:"Выбор из короткого списка",random:"Случайно"},
    })),immunity};
  }
  override activateListeners(html:JQuery){
    super.activateListeners(html);
    const root=html[0];if(!root)return;
    const biowareLabel=root.querySelector<HTMLElement>("[data-bioware-label]");
    if(biowareLabel)markHomebrew(biowareLabel);
    const frameLabel=root.querySelector<HTMLElement>("[data-frame-label]");
    if(frameLabel)markHomebrew(frameLabel);
    const update=()=>{
      const checked=(name:string)=>!!root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked;
      for(const [selector,visible] of [["[data-frame-movement]",!checked("frameNoMove")],["[data-frame-reduction]",checked("frameReduceMove")],["[data-frame-penalty]",checked("frameActionPenalty")]] as const){
        const element=root.querySelector<HTMLElement>(selector);if(element)element.hidden=!visible;
      }
      const weights=root.querySelector<HTMLElement>("[data-foundation-weight]");
      if(weights)weights.hidden=!root.querySelector<HTMLInputElement>('[name="includeFoundational"]')?.checked;
      root.querySelectorAll<HTMLElement>("[data-emp-profile]").forEach(section=>{
      const method=section.querySelector<HTMLSelectElement>("[data-method]")?.value;
      section.querySelectorAll<HTMLElement>("[data-random-options]").forEach(el=>el.hidden=method==="manual");
      section.querySelectorAll<HTMLElement>("[data-shortlist-options]").forEach(el=>el.hidden=method!=="shortlist");
    });
    };
    root.addEventListener("change",update);update();
  }
  protected override async _updateObject(_event:Event,data:Record<string,unknown>){
    if(!game.user?.isGM)throw Error("Настраивать ЭМИ может только Мастер.");
    const expanded=foundry.utils.expandObject(data);
    await game.settings!.set(MODULE,"empBehavior",normalizeEmpBehavior(expanded));
    await game.settings!.set(MODULE,"empImmunity",String(data.immunity??""));
  }
}
export function registerEmpSettings(){
  game.settings!.register(MODULE,"empBehavior",{scope:"world",config:false,
    // @ts-expect-error Foundry v12 supports ObjectField settings; pinned typings omit it.
    type:new foundry.data.fields.ObjectField(),default:normalizeEmpBehavior({})});
  game.settings!.registerMenu(MODULE,"empBehaviorMenu",{name:"Действие ЭМИ",label:"Настроить",
    hint:"Способы выбора для Мастера и игрока, случайные веса и короткие списки для игроков.",
    icon:"fas fa-bolt",type:EmpSettingsForm,restricted:true});
}
