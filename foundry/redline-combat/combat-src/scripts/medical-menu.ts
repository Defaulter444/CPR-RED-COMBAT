import type {MedicalEntry} from "./medical.js";
export interface MedicalMenuGroup {label:string;submenu:boolean;choices:MedicalEntry[]}
/** Group eligible skills by action/injury; retain direct buttons for single choices. */
export function medicalMenuGroups(rows:MedicalEntry[]):MedicalMenuGroup[] {
 const groups=new Map<string,MedicalMenuGroup>();
 for(const row of rows){
  const key=row.action+":"+(row.item??"");
  const group=groups.get(key)??{label:row.groupLabel??row.label,submenu:false,choices:[]};
  group.choices.push({...row,label:row.choiceLabel??row.label});groups.set(key,group);
 }
 for(const group of groups.values()){
  group.submenu=group.choices.length>1;
  if(!group.submenu){const row=rows.find(row=>row.action===group.choices[0]!.action&&row.item===group.choices[0]!.item)!;group.choices[0]!.label=row.label;}
 }
 return [...groups.values()];
}
