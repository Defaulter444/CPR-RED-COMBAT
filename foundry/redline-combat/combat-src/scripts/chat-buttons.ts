/** Shared presentation for Combat Tools chat controls only. Native roll links stay untouched. */
const controls=[
  ".pneuma-defense-controls button", ".pneuma-evasion-override", ".pneuma-result-damage", ".pneuma-apply-damage", ".pneuma-apply-critical",
  ".pneuma-damage-status-slot", ".pneuma-damage-recovery-controls button", ".pneuma-quickhack-actions button",
  ".pneuma-grapple-controls button", "[data-aoe-action]", "[data-instant-action]", "[data-emp-select]", "[data-status-cleanup]", "[data-copy-combat-summary]",
  "[data-scene-effect-action]", "[data-trap-action]", "[data-ribs-apply]", ".pneuma-manual-controls button", ".pneuma-group-action button", ".pneuma-half-armor", ".pneuma-interact-armor"
  , '.pneuma-trap-card a.content-link[data-uuid^="ChatMessage."]', '.pneuma-trap-card a.content-link[data-type="ChatMessage"]'
].join(",");
const observed=new WeakSet<HTMLElement>();
const cardRoots='.pneuma-combat-message,.pneuma-manual-card,.pneuma-aoe-card,.pneuma-instant-card,.pneuma-emp-card,.pneuma-grapple-card,.pneuma-quickhack-card,.pneuma-status-cleanup-card';
const icons:Record<string,string>={evade:'fa-person-running',damage:'fa-droplet',apply:'fa-bolt',injury:'fa-heart-crack',roll:'fa-dice',resist:'fa-shield-halved',retry:'fa-wrench',release:'fa-wrench',cancel:'fa-xmark',choose:'fa-list-check'};
const clicked=new WeakSet<HTMLElement>();
const disabled=(node:HTMLElement)=>node.matches(":disabled,[aria-disabled=\"true\"]");
function decorate(node:HTMLElement):void {
  node.classList.add("pneuma-chat-button");
  // Saved chat cards may still contain the old visible Reset label.
  if(node.dataset.aoeAction==="reset"&&!node.closest(".pneuma-effect-gm-controls")&&(node.textContent?.trim()||!node.querySelector(".fa-rotate-left"))){
    const icon=document.createElement("i");icon.className="fas fa-rotate-left";icon.setAttribute("aria-hidden","true");
    node.replaceChildren(icon);
  }
  const text=node.textContent?.trim()??"",action=node.dataset.chatAction??node.dataset.sceneEffectAction??node.dataset.trapAction??node.dataset.aoeAction??node.dataset.instantAction??node.dataset.quickhackAction??"";
  const gmOnly=!!node.dataset.trapAction || !!node.dataset.sceneEffectAction && action!=="avoid" || node.dataset.gmOnly==="true"
    || !!node.dataset.aoeAction && ["show","removeSmoke","scatter","hit","miss","exclude","forcehit","add","reset","damageReset","damageResolved","effectsResolved"].includes(action)
    || !!node.dataset.instantAction && ["skip","reset","review"].includes(action);
  node.dataset.chatRole=gmOnly?"gm":"player";
  const iconOnly=!text || node.classList.contains("pneuma-damage-status-slot");
  node.classList.toggle("pneuma-chat-icon",iconOnly);
  const recovery=["reset","damageReset","damageResolved","effectsResolved","review","forcehit","exclude","skip","retry","release"].includes(action)
    || node.closest(".pneuma-damage-recovery-controls");
  const cancel=node.classList.contains("pneuma-cancel-exchange")||action==="cancel"||action==="removeSmoke";
  node.dataset.chatKind=node.matches(".pneuma-half-armor, .pneuma-interact-armor")?"toggle":cancel?"cancel":recovery?"recovery":"action";
  if(!iconOnly&&node.dataset.chatKind!=="toggle"&&!node.querySelector("i,img,svg")) {
    const icon=document.createElement("i");icon.setAttribute("aria-hidden","true");
    const inferred=node.matches('.pneuma-evasion-override')?'evade':node.matches('.pneuma-result-damage')?'damage'
      :node.matches('.pneuma-apply-damage,[data-ribs-apply]')?'apply':node.matches('.pneuma-apply-critical')?'injury'
      :node.matches('[data-emp-select]')?'choose':node.closest('.pneuma-group-action')?'roll':undefined;
    const name=node.dataset.chatIcon??(cancel?'fa-xmark':recovery?'fa-wrench':node.dataset.instantAction==='roll'?'fa-shield-halved':icons[action]??icons[inferred??'']??'fa-arrow-right');
    icon.className="fas "+name+" pneuma-chat-action-icon";node.prepend(icon);
  }
  const busy=clicked.has(node)&&disabled(node);
  node.classList.toggle("pneuma-chat-busy",busy);
  if(busy)node.setAttribute("aria-busy","true");else {node.removeAttribute("aria-busy");clicked.delete(node);}
  const completed=!busy&&disabled(node)&&(node.matches('.pneuma-apply-damage[data-pneuma-damage-target="recorded"]')
    || node.dataset.chatState==="applied");
  node.classList.toggle("pneuma-chat-complete",completed);
  if(completed&&iconOnly){node.title="Нанесено";node.setAttribute("aria-label","Нанесено");}
  if(!node.title&&node.getAttribute("aria-label"))node.title=node.getAttribute("aria-label")!;
}
export function styleChatButtons(root:HTMLElement, moduleCard=false):void {
  if(!moduleCard&&!root.matches(cardRoots)&&!root.querySelector(cardRoots+','+controls))return;
  for(const node of Array.from(root.querySelectorAll<HTMLElement>(controls)))decorate(node);
  if(observed.has(root))return;observed.add(root);
  // Inspect changed controls/subtrees only; native dice expansion needs no full-card pass.
  const observer=new MutationObserver(records=>{
    observer.disconnect();
    const changed=new Set<HTMLElement>();
    const collect=(node:Node)=>{
      const element=node instanceof Element?node:node.parentElement;
      const button=element?.closest<HTMLElement>(controls);if(button&&root.contains(button))changed.add(button);
      if(element)for(const child of Array.from(element.querySelectorAll<HTMLElement>(controls)))changed.add(child);
    };
    for(const record of records){
      if(record.type==='childList'){for(const node of Array.from(record.addedNodes))collect(node);const button=(record.target as Element).closest?.<HTMLElement>(controls);if(button)changed.add(button);}
      else collect(record.target);
    }
    for(const node of changed)if(root.contains(node))decorate(node);
    watch();
  });
  const watch=()=>observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["disabled","aria-disabled","aria-pressed","title","data-gm-only","data-chat-state","data-chat-action"]});
  root.addEventListener("click",event=>{
    const node=(event.target as Element).closest<HTMLElement>(controls);
    if(node&&!disabled(node)){clicked.add(node);setTimeout(()=>{observer.disconnect();decorate(node);watch();},0);}
  },true);
  watch();
}
export function registerChatButtons():void {
  Hooks.on("renderChatMessage",(message:ChatMessage,html:JQuery)=>{
    if(html[0])styleChatButtons(html[0],!!foundry.utils.getProperty(message,'flags.redline-combat'));
  });
}
