/** Local display choices only; these helpers never change Foundry Documents. */
export function selectedWeapon(actor) {
  const weapons = Array.isArray(actor?.weapons) ? actor.weapons : [];
  return weapons.find(item => String(item.id) === String(actor?.selectedWeaponId)) || weapons[0] || null;
}

export function safeInsets({width, height, controls, sidebar, hotbar, hostBar, navigation, timer, queueHeight = 78} = {}) {
  const w = Number.isFinite(width) ? Math.max(width, 1) : 1280;
  const h = Number.isFinite(height) ? Math.max(height, 1) : 720;
  const visible = rect => rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.left < w && rect.top < h;
  const left = visible(controls) && controls.left < w / 3 ? Math.max(12, controls.right + 12) : 12;
  const right = visible(sidebar) && sidebar.left > w / 2 ? Math.max(12, w - sidebar.left + 12) : 12;
  let top = Math.min(h / 3, Math.max(12, ...[hostBar, navigation].filter(visible).map(rect => rect.bottom + 12)));
  const bottom = visible(hotbar) && hotbar.top > h / 2 ? Math.max(12, h - hotbar.top + 10) : 14;
  const safeLeft = Math.min(left, w / 3), safeRight = Math.min(right, w / 2);
  // A user-dragged timer only reserves space when it intersects this queue's region.
  // Never reposition the timer or write its stored placement from REDLINE.
  const overlapsHorizontally = visible(timer) && timer.right > safeLeft && timer.left < w - safeRight;
  const queueSize = Number.isFinite(queueHeight) ? Math.max(0, queueHeight) : 78;
  if (overlapsHorizontally && timer.bottom + 12 > top && timer.top < top + queueSize + 12) top = Math.max(top, timer.bottom + 12);
  return {left:Math.round(safeLeft), right:Math.round(safeRight), top:Math.round(top), bottom:Math.round(Math.min(bottom,h / 3))};
}

/** The disclosure occupies only the map gap between initiative and the dock. */
export function skillPopupHeight({dockTop, queueBottom, viewportHeight} = {}) {
  if (!Number.isFinite(dockTop)) return 0;
  const ceiling = Math.max(12, Number.isFinite(queueBottom) ? queueBottom + 12 : 12);
  const gap = Math.max(0, dockTop - 8 - ceiling);
  const viewportLimit = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight * .42) : 330;
  return Math.floor(Math.min(330, viewportLimit, gap));
}

/** A short map gap becomes a drawer over the dock, preserving queue and macros. */
export function skillPopupLayout({dockTop, dockBottom, queueBottom, viewportHeight} = {}) {
  const above = skillPopupHeight({dockTop,queueBottom,viewportHeight});
  if (above >= 180 || !Number.isFinite(dockBottom)) return {placement:'above',height:above};
  const ceiling = Math.max(12, Number.isFinite(queueBottom) ? queueBottom + 12 : 12);
  const viewportLimit = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight * .42) : 330;
  const drawer = Math.floor(Math.min(330, viewportLimit, Math.max(0, dockBottom - ceiling)));
  return drawer > above ? {placement:'dock',height:drawer} : {placement:'above',height:above};
}
