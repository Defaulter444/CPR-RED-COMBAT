/** Local display choices only; these helpers never change Foundry Documents. */
export function selectedWeapon(actor) {
  const weapons = Array.isArray(actor?.weapons) ? actor.weapons : [];
  return weapons.find(item => String(item.id) === String(actor?.selectedWeaponId)) || weapons[0] || null;
}

export const DEFAULT_INTERFACE_SCALE = 80;
export const MIN_INTERFACE_SCALE = 50;
export const MAX_INTERFACE_SCALE = 150;
/** Widest strip layout before client zoom; the real width is also limited by the free map area. */
export const STRIP_MAX_WIDTH = 1000;

export function normalizeInterfaceScale(value) {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) return DEFAULT_INTERFACE_SCALE;
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, Math.round(Number(value))));
}

/** Dragging the corner grip right or up enlarges the strip: four screen pixels per percent. */
export function scaleFromDrag({startScale, dx = 0, dy = 0} = {}) {
  const delta = (Number.isFinite(dx) ? dx : 0) - (Number.isFinite(dy) ? dy : 0);
  return normalizeInterfaceScale(normalizeInterfaceScale(startScale) + delta / 4);
}

/** Lit HP segments: ceil(value / max × count) while HP is above zero; null without usable HP. */
export function hpSegments(hp, count = 10) {
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) return null;
  if (hp.value <= 0) return 0;
  return Math.min(count, Math.ceil(hp.value / hp.max * count));
}

/** The preferred strip width is measured before its client zoom is applied. */
export function panelSizing({availableWidth, scale} = {}) {
  const percent = normalizeInterfaceScale(scale), factor = percent / 100;
  const width = Number.isFinite(availableWidth) ? Math.max(1, availableWidth) : STRIP_MAX_WIDTH * factor;
  const layoutWidth = Math.min(STRIP_MAX_WIDTH, width / factor);
  return {percent,factor,layoutWidth,actualWidth:layoutWidth * factor};
}

export function safeInsets({width, height, controls, sidebar, hotbar, hostBar, navigation, timer, queueHeight = 78, queueWidth} = {}) {
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
  const queueRight = Number.isFinite(queueWidth) ? Math.min(w - safeRight, safeLeft + Math.max(0, queueWidth)) : w - safeRight;
  const overlapsHorizontally = visible(timer) && timer.right > safeLeft && timer.left < queueRight;
  const queueSize = Number.isFinite(queueHeight) ? Math.max(0, queueHeight) : 78;
  if (overlapsHorizontally && timer.bottom + 12 > top && timer.top < top + queueSize + 12) top = Math.max(top, timer.bottom + 12);
  return {left:Math.round(safeLeft), right:Math.round(safeRight), top:Math.round(top), bottom:Math.round(Math.min(bottom,h / 3))};
}

/** Cards open upward into the map gap between the initiative queue and the strip. */
export function cardMaxHeight({stripTop, queueBottom, viewportHeight} = {}) {
  if (!Number.isFinite(stripTop)) return 0;
  const ceiling = Math.max(12, Number.isFinite(queueBottom) ? queueBottom + 12 : 12);
  const gap = Math.max(0, stripTop - 8 - ceiling);
  const viewportLimit = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight * .6) : 430;
  return Math.floor(Math.min(430, viewportLimit, gap));
}
