import {hasInstantCondition} from "./instant-lifetime.js";
import {wakeUsingAction,isUnconscious} from "./wake.js";
import {injuryTreatmentChoices,nativeTreatmentSkill,stabilizationStates,stabilizationSkills,type TreatmentChoice} from "./medical-rules.js";
export {injuryTreatmentChoices,type TreatmentChoice} from "./medical-rules.js";
import {escapeHTML as esc} from "./shared.js";
import {nativeCard,spendBonusLuck,type RollItem} from "./native-combat.js";
import {checkedLuck} from "./evasion-rules.js";
import {postTreatment} from "./treatment-card.js";
import { statusLabel } from "./status-labels.js";
const treatmentSkillLabel=(skill:string)=>({"First Aid":"Первая помощь","Paramedic":"Парамедицина","Surgery":"Хирургия"} as Record<string,string>)[skill]??skill;
const treatmentStageLabel=(stage:string)=>({"Stabilize":"Стабилизация","QuickFix":"Быстрое лечение","Treatment":"Лечение"} as Record<string,string>)[stage]??stage;

export async function openTreatment():Promise<void> {
  const tokens=canvas.tokens?.controlled??[],source=tokens[0],actor=source?.actor;
  if(tokens.length!==1||!actor?.isOwner||!["character","mook"].includes(String(actor.type)))throw Error("Выберите один свой токен персонажа.");
  const targets=Array.from(game.user?.targets??[]);
  const patients=(canvas.tokens?.placeables??[]).filter(token=>token.actor&&(token.actor.hasPlayerOwner||hasInstantCondition(token.actor,"fire"))&&(game.user?.isGM||token.isVisible)).sort((a,b)=>a.name.localeCompare(b.name));
  const selected=targets.length===1&&patients.includes(targets[0]!)?targets[0]!.document.uuid:"";
  const patientControl='<div class="pneuma-treatment-patient-picker"><label>Пациент <select data-treatment-patient><option value="">Выберите пациента…</option>'+patients.map(token=>'<option value="'+esc(token.document.uuid)+'"'+(selected===token.document.uuid?' selected':'')+'>'+esc(token.name)+'</option>').join('')+'<option value="custom">Ввести имя пациента…</option></select></label><input type="text" data-treatment-patient-name placeholder="Имя пациента" aria-label="Имя пациента" hidden></div>';
  const injuries:Record<string,Item[]>={};
  for(const location of ["body","head"] as const) {
    const pack=game.packs?.get("cyberpunk-red-core.core_critical-injuries-"+location);
    if(!pack)throw Error("Компендиум критических травм ("+(location==="head"?"голова":"тело")+") недоступен.");
    injuries[location]=(await pack.getDocuments() as Item[]).filter(item=>String(item.type)==="criticalInjury").sort((a,b)=>a.name!.localeCompare(b.name!));
  }
  const slot=(stage:string,skill:string)=>'<button type="button" data-treatment-stage="'+stage+'" data-treatment-skill="'+skill+'">'+treatmentSkillLabel(skill)+'</button>';
  const section=(location:"body"|"head")=>'<section class="pneuma-treatment-section" data-treatment-location="'+location+'"><h3>'+(location==="body"?'Криты тела':'Криты головы')+'</h3><div class="pneuma-treatment-columns"><div><h4>Травма</h4><select data-treatment-select aria-label="'+location+' — критическая травма">'+injuries[location]!.map((item,index)=>'<option value="'+index+'">'+esc(item.name)+'</option>').join('')+'</select></div><div><h4>QuickFix</h4><div class="pneuma-treatment-options">'+slot("QuickFix","First Aid")+slot("QuickFix","Paramedic")+'</div></div><div><h4>Лечение</h4><div class="pneuma-treatment-options">'+slot("Treatment","Paramedic")+slot("Treatment","Surgery")+'</div></div></div></section>';
  const content=patientControl+'<section class="pneuma-treatment-section"><h3>Горит</h3><button type="button" data-treatment-extinguish>Потушить (действие)</button></section>'+'<div class="pneuma-treatment-list"><section class="pneuma-treatment-section" data-treatment-location="stabilize"><h3>Стабилизация</h3><table class="pneuma-stabilize-table"><thead><tr><th>Ранение</th><th>Первая помощь</th><th>Парамедицина</th></tr></thead><tbody>'+stabilizationStates.map(({name,dv})=>'<tr><td>'+statusLabel(name)+'</td>'+stabilizationSkills.map(skill=>'<td><button type="button" data-treatment-stage="Stabilize" data-treatment-skill="'+skill+'" data-wound-name="'+name+'" data-wound-dv="'+dv+'">'+treatmentSkillLabel(skill)+' DV'+dv+'</button></td>').join('')+'</tr>').join('')+'</tbody></table></section>'+section("body")+section("head")+'</div>';
  let busy=false;
  new Dialog({title:"Лечение — "+actor.name,content,buttons:{},render:html=>{
    const root=(html as JQuery)[0]!;
    const patientSelect=root.querySelector<HTMLSelectElement>("[data-treatment-patient]")!,patientName=root.querySelector<HTMLInputElement>("[data-treatment-patient-name]")!;
    patientSelect.addEventListener("change",()=>{patientName.hidden=patientSelect.value!=="custom";if(!patientName.hidden)patientName.focus();});
    const extinguish=root.querySelector<HTMLButtonElement>("[data-treatment-extinguish]")!;
    const updateFire=()=>{const patient=patients.find(token=>token.document.uuid===patientSelect.value);extinguish.disabled=busy||isUnconscious(actor)||!patient?.actor||!hasInstantCondition(patient.actor,"fire");};
    patientSelect.addEventListener("change",updateFire);updateFire();
    extinguish.addEventListener("click",()=>{
      const patient=patients.find(token=>token.document.uuid===patientSelect.value);if(busy||extinguish.disabled||!patient)return;
      busy=true;updateFire();
      void wakeUsingAction(source!,patient,"extinguish").catch(error=>ui.notifications!.error(String(error))).finally(()=>{busy=false;updateFire();});
    });
    const choiceFor=(section:HTMLElement,button:HTMLButtonElement):TreatmentChoice|undefined=>{
      const location=section.dataset.treatmentLocation!;
      const skill=button.dataset.treatmentSkill!,stage=button.dataset.treatmentStage!;
      if(location==="stabilize")return {name:button.dataset.woundName!,skill,dv:Number(button.dataset.woundDv),stage:"Stabilize"};
      const selection=section.querySelector<HTMLSelectElement>("select")!.value;
      const injury=injuries[location]?.[Number(selection)];if(!injury)return;
      return injuryTreatmentChoices(injury,location as "body"|"head").find(row=>row.skill===skill&&row.stage===stage);
    };
    root.querySelectorAll<HTMLElement>("[data-treatment-location]").forEach(section=>{
      const update=()=>section.querySelectorAll<HTMLButtonElement>("button").forEach(button=>{
        const choice=choiceFor(section,button);
        button.textContent=treatmentSkillLabel(button.dataset.treatmentSkill??"")+(choice?' DV'+choice.dv:' —');button.disabled=!choice||!nativeTreatmentSkill(actor,choice.skill)||busy;
        button.title=choice?(choice.permanent?'Постоянное лечение через QuickFix':''):'Недоступно для этой травмы';
      });
      section.querySelector("select")?.addEventListener("change",update);update();
      section.querySelectorAll<HTMLButtonElement>("button").forEach(button=>button.addEventListener("click",event=>{
        if(busy||button.disabled)return;const choice=choiceFor(section,button),native=choice&&nativeTreatmentSkill(actor,choice.skill);if(!choice||!native||!actor.isOwner)return;
        const target=patientSelect.value==="custom"?{name:patientName.value.trim()}:patients.find(token=>token.document.uuid===patientSelect.value);
        if(!target?.name){ui.notifications!.error("Выберите пациента или введите его имя.");return;}
        busy=true;update();
        void (async()=>{
          const item=native.item as RollItem;
          let roll=item.createRoll(native.type,actor,native.subtype?{rollSubType:native.subtype,subRoleName:native.title}:undefined);
          roll.rollTitle=treatmentStageLabel(choice.stage)+" — "+statusLabel(choice.name)+" — "+treatmentSkillLabel(choice.skill)+" DV"+choice.dv;
          if(!await roll.handleRollDialog({type:"pneuma-treatment",ctrlKey:event.shiftKey,metaKey:false},actor,item))return;
          checkedLuck(Number(foundry.utils.getProperty(actor,"system.stats.luck.value")),0,roll.luck);
          roll=await item.confirmRoll(roll);await spendBonusLuck(actor,roll.luck);await roll.roll();
          await postTreatment(source!,target,choice.stage+" — "+choice.name,await nativeCard(roll),roll.resultTotal,choice.dv);
        })().catch(error=>ui.notifications!.error(String(error))).finally(()=>{busy=false;update();});
      }));
    });
  }},{width:720,classes:["pneuma-roll-dialog"]}).render(true);
}
