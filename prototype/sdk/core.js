// System-neutral browser component utilities; Foundry host bridges are specified separately.
export function createMachine(transitions) {
 return (state,event)=>{
  const phase=transitions[state.phase]?.[event];
  return phase?{...state,phase,revision:(state.revision||0)+1}:state;
 };
}
export class OperationRegistry {
 #operations=new Map();
 register(description,implementation){
  if(this.#operations.has(description.id))throw new Error('DUPLICATE_OPERATION');
  this.#operations.set(description.id,{description,implementation});
  return ()=>this.#operations.delete(description.id);
 }
 describe(){return [...this.#operations.values()].map(o=>structuredClone(o.description));}
 async preview(id,args){
  const o=this.#operations.get(id);if(!o)throw new Error('UNKNOWN_OPERATION');
  if(!o.implementation.preview)throw new Error('PREVIEW_UNSUPPORTED');
  return o.implementation.preview(structuredClone(args));
 }
 // A host adapter must enforce authorization and consistency; this registry does neither.
 async execute(id,args,host){
  const o=this.#operations.get(id);if(!o)throw new Error('UNKNOWN_OPERATION');
  if(!host?.authorize||!await host.authorize(o.description,args))throw new Error('PERMISSION_DENIED');
  return o.implementation.execute(structuredClone(args),host);
 }
}
export function panel({title,content,onClose}){
 const dialog=document.createElement('dialog');dialog.className='example-dialog';
 const heading=document.createElement('h2');heading.textContent=title;
 const body=document.createElement('div');body.append(content);
 const close=document.createElement('button');close.textContent='Закрыть';close.addEventListener('click',()=>dialog.close());
 dialog.append(heading,body,close);dialog.addEventListener('close',()=>{dialog.remove();onClose?.()},{once:true});document.body.append(dialog);dialog.showModal();return ()=>dialog.close();
}
