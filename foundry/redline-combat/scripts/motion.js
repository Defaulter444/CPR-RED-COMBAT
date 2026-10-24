/** Short, state-driven UI motion. No timers, canvas hooks, or game writes while idle. */
const running = new WeakMap();
const ease = 'cubic-bezier(.2,.8,.2,1)';

export function motionAllowed(root) {
  const container = root?.matches?.('.redline-interface') ? root
    : root?.closest?.('.redline-interface') || root?.querySelector?.('.redline-interface');
  const view = root?.ownerDocument?.defaultView || globalThis;
  return container?.dataset.animations !== 'false' && !view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function play(element, frames, options = {}) {
  if (!element?.animate || !motionAllowed(element)) return null;
  running.get(element)?.cancel();
  const animation = element.animate(frames, {duration:190, easing:ease, ...options});
  running.set(element, animation);
  animation.finished.catch(() => {}).finally(() => {
    if (running.get(element) === animation) running.delete(element);
  });
  return animation;
}

export function captureHUD(root) {
  if (!root?.querySelector) return null;
  const query = selector => root.querySelector(selector);
  const visible = selector => { const element = query(selector); return Boolean(element && !element.hidden); };
  const actor = query('#redline-dock-content');
  return {
    actor:actor?.dataset.actorKey || query('[data-subject]')?.dataset.subject || '',
    expanded:Boolean(query('.is-dock-expanded')),
    skills:visible('#redline-skills-panel'), arsenal:visible('#redline-arsenal-panel'),
    weapon:query('.redline-weapons')?.dataset.weaponId || query('[data-weapon-select]')?.value || '',
    hp:query('.redline-health')?.textContent || '',
    hpPercent:query('.redline-meter > span')?.style.width || '0%',
    ammo:query('.redline-weapon-ammo')?.textContent || '',
    current:query('.redline-unit.is-current')?.dataset.id || '',
    status:query('.redline-action-status')?.textContent || '',
    result:query('[data-motion="result"]')?.dataset.resultId || '',
  };
}

export function animateHUD(root, previous) {
  const next = captureHUD(root);
  if (!next || !motionAllowed(root)) return next;
  const query = selector => root.querySelector(selector);
  const enter = (selector, delay = 0) => play(query(selector), [
    {opacity:0, transform:'translateY(10px)'}, {opacity:1, transform:'translateY(0)'}
  ], {duration:210,delay});
  if (!previous) { enter('.redline-dock'); enter('.redline-combat',40); }
  else if (next.expanded !== previous.expanded || next.actor !== previous.actor) {
    enter(next.expanded ? '.redline-actor' : '.redline-compact-summary');
    if (next.expanded) {
      for (const [index, selector] of ['.redline-identity','.redline-weapons','.redline-primary-actions'].entries()) enter(selector,index*25);
    }
  }
  if (next.skills && (!previous?.skills || next.actor !== previous.actor)) enter('#redline-skills-panel');
  if (next.arsenal && (!previous?.arsenal || next.actor !== previous.actor)) {
    enter('#redline-arsenal-panel');
    root.querySelectorAll('.redline-arsenal-card').forEach((card,index) => play(card,[
      {opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}
    ],{duration:170,delay:Math.min(index,5)*22}));
  }
  if (previous && next.actor === previous.actor) {
    if (next.weapon !== previous.weapon) {
      play(query('.redline-weapon-art'),[{opacity:.25,transform:'translateX(-10px)'},{opacity:1,transform:'translateX(0)'}],{duration:200});
      enter('.redline-weapon-data',35);
    }
    for (const [key, selector] of [['hp','.redline-health'],['ammo','.redline-weapon-ammo']]) {
      if (next[key] !== previous[key]) play(query(selector),[{opacity:.4,transform:'translateY(-3px)'},{opacity:1,transform:'translateY(0)'}],{duration:220});
    }
    if (next.hpPercent !== previous.hpPercent) play(query('.redline-meter > span'),[{width:previous.hpPercent},{width:next.hpPercent}],{duration:300});
    if (next.current !== previous.current) play(query('.redline-unit.is-current'),[{transform:'translateX(6px)',opacity:.5},{transform:'translateX(0)',opacity:1}],{duration:240});
    if (next.status && next.status !== previous.status) enter('.redline-action-status');
    if (next.result && next.result !== previous.result) enter('[data-motion="result"]');
  }
  return next;
}

export function animateSkillResults(panel) {
  return play(panel?.querySelector('.redline-skill-results'),[
    {opacity:.25,transform:'translateX(5px)'},{opacity:1,transform:'translateX(0)'}
  ],{duration:140});
}

export async function closeDrawer(panel) {
  if (!panel || panel.hidden) return;
  const previousPointerEvents = panel.style.pointerEvents;
  panel.style.pointerEvents = 'none';
  const animation = play(panel,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(6px)'}],{duration:120});
  if (animation) await animation.finished.catch(() => {});
  panel.hidden = true;
  panel.style.pointerEvents = previousPointerEvents;
}
