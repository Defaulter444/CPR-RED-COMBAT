import {createMachine} from './core.js';
// Browser-only demonstration. Not a Foundry authority or multi-client transaction layer.
export const operationCatalog = Object.freeze([
 {id:'redline.prepare',version:1,permission:'owner',preview:true,mutates:false,args:{actor:'id',weapon:'id',target:'id'}},
 {id:'redline.execute',version:1,permission:'owner',preview:false,mutates:true,args:{requestId:'uuid',revision:'integer'},compensation:'none'},
 {id:'redline.chooseDefense',version:1,permission:'defender',mutates:true,args:{requestId:'uuid',choice:'evade|decline'}},
 {id:'redline.apply',version:1,permission:'gm',mutates:true,args:{requestId:'uuid'},compensation:'manual-reviewed'},
 {id:'ui.openPanel',version:1,permission:'user',mutates:false,args:{panel:'id'},cleanup:'close'}
]);
export function preview({ammo,weapon,target,knownDv}) {
 if(!weapon)return {ok:false,code:'NO_WEAPON',reason:'Нет оружия. Выберите другого персонажа.'};
 if(!target)return {ok:false,code:'NO_VISIBLE_TARGET',reason:'Выберите доступную цель на карте.'};
 if(ammo<1)return {ok:false,code:'EMPTY_MAGAZINE',reason:'Магазин пуст. Нужна перезарядка.'};
 if(!knownDv)return {ok:false,code:'MISSING_DV',reason:'Нет таблицы DV. Выберите таблицу в системе; результат не определён.'};
 return {ok:true,cost:1,source:'Демонстрационный сценарий: Handgun, 7–12 м',dv:15};
}
export function publicDefenseProjection(request) {
 return {id:request.id,phase:request.phase,attacker:request.attacker,target:request.target,allowed:['evade','decline'],deadline:null};
}
export const advance=createMachine({prepared:{execute:'awaiting-defense'},'awaiting-defense':{evade:'resolved',decline:'resolved'},resolved:{apply:'applied'}});
export class Lifetime {
 constructor(){this.controller=new AbortController();this.disposers=[];}
 on(el,event,callback){el.addEventListener(event,callback,{signal:this.controller.signal});}
 add(dispose){this.disposers.push(dispose);}
 close(){this.controller.abort();this.disposers.splice(0).reverse().forEach(fn=>fn());}
}
