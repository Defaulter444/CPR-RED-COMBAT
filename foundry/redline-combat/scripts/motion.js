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

const rise = (element, distance = 8, options = {}) => play(element, [
  {opacity:0, transform:`translateY(${distance}px)`}, {opacity:1, transform:'translateY(0)'}
], {duration:120, ...options});

export function captureHUD(root) {
  if (!root?.querySelector) return null;
  const query = selector => root.querySelector(selector);
  return {
    actor:query('.redline-strip')?.dataset.actorKey || '',
    card:query('.redline-card:not([hidden])')?.dataset.card || '',
    weapon:query('.redline-cell-weapon')?.dataset.weaponId || '',
    hp:query('.redline-hp')?.dataset.hpValue ?? '',
    lit:query('.redline-segments')?.dataset.lit ?? '',
    ammo:query('[data-vital="ammo"]')?.textContent || '',
    current:query('.redline-unit.is-current')?.dataset.id || '',
    status:query('.redline-action-status')?.textContent || '',
    result:query('.redline-toast')?.dataset.resultId || '',
  };
}

export function animateHUD(root, previous) {
  const next = captureHUD(root);
  if (!next || !motionAllowed(root)) return next;
  const query = selector => root.querySelector(selector);
  if (!previous) {
    rise(query('.redline-strip-wrap'), 10, {duration:200});
    rise(query('.redline-combat'), -8, {duration:200, delay:40});
    return next;
  }
  if (next.actor !== previous.actor) rise(query('.redline-strip-wrap'), 6, {duration:160});
  if (next.card && (next.card !== previous.card || next.actor !== previous.actor)) rise(query(`.redline-card[data-card="${next.card}"]`));
  if (next.result && next.result !== previous.result) {
    rise(query('.redline-toast'), 10, {duration:180});
    play(query('.redline-strip'), [{filter:'brightness(1.6)'}, {filter:'brightness(1)'}], {duration:320});
  }
  if (next.actor !== previous.actor) return next;
  if (next.weapon !== previous.weapon) play(query('.redline-cell-weapon'), [{opacity:.3}, {opacity:1}], {duration:160});
  if (next.ammo !== previous.ammo) play(query('[data-vital="ammo"]'), [{opacity:.35, transform:'translateY(-3px)'}, {opacity:1, transform:'translateY(0)'}], {duration:200});
  const before = Number(previous.lit), after = Number(next.lit);
  if (previous.lit !== '' && next.lit !== '' && after < before) {
    // Lost HP segments flash red, then fade to their unlit colour.
    const segments = root.querySelectorAll('.redline-segments i');
    for (let index = after; index < before; index++) play(segments[index], [{backgroundColor:'#f04452'}, {}], {duration:420, delay:(index - after) * 40});
  }
  if (next.current !== previous.current) play(query('.redline-unit.is-current'), [{transform:'translateX(6px)', opacity:.5}, {transform:'translateX(0)', opacity:1}], {duration:240});
  if (next.status && next.status !== previous.status) rise(query('.redline-feedback'), 4);
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
