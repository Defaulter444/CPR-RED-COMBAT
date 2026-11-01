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

/** Strip controls a result belongs to, most specific first; actions from cards point at the card's cell. */
const TOAST_ANCHORS = Object.freeze({
  'weapon-attack':['[data-action="weapon-attack"]'], 'weapon-damage':['[data-action="weapon-damage"]'],
  'weapon-reload':['[data-action="weapon-reload"]', '[data-cell="weapon"]'], 'weapon-load':['[data-cell="weapon"]'],
  skill:['[data-cell="skills"]'], initiative:['[data-cell="more"]'], 'death-save':['[data-cell="more"]'],
});
export function toastAnchors(kind) {
  return [...(TOAST_ANCHORS[kind] ?? [])];
}

/**
 * The result toast stands centred over its control and stays inside the free area.
 * anchor, wrap and bounds are screen rectangles (bounds already clipped to the viewport); width and the returned
 * {left, width} are layout pixels inside the zoomed strip wrapper.
 */
export function toastPlacement({anchor, wrap, bounds, width = 320, factor = 1, margin = 8} = {}) {
  if (!wrap || !bounds) return null;
  const f = factor > 0 ? factor : 1;
  const size = Math.floor(Math.max(0, Math.min(width, (bounds.right - bounds.left - 2 * margin) / f)));
  const center = anchor ? (anchor.left + anchor.right) / 2 : (wrap.left + wrap.right) / 2;
  const min = (bounds.left + margin - wrap.left) / f;
  const max = (bounds.right - margin - wrap.left) / f - size;
  return {left:Math.round(Math.max(min, Math.min((center - wrap.left) / f - size / 2, max))), width:size};
}

/** Cards open upward into the map gap between the initiative queue and the strip. */
export function cardMaxHeight({stripTop, queueBottom, viewportHeight} = {}) {
  if (!Number.isFinite(stripTop)) return 0;
  const ceiling = Math.max(12, Number.isFinite(queueBottom) ? queueBottom + 12 : 12);
  const gap = Math.max(0, stripTop - 8 - ceiling);
  const viewportLimit = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight * .6) : 430;
  return Math.floor(Math.min(430, viewportLimit, gap));
}

/** Strip layouts from richest to most compact: compact drops SP and shortens names, tight keeps icons and numbers. */
export const STRIP_DENSITIES = Object.freeze(['full', 'compact', 'tight']);

/** First layout whose natural width fits the free strip width; measure(density) returns layout pixels. */
export function chooseDensity(measure, available) {
  if (!Number.isFinite(available)) return STRIP_DENSITIES[0];
  for (const density of STRIP_DENSITIES) {
    const width = measure(density);
    if (!Number.isFinite(width) || width <= available) return density;
  }
  return STRIP_DENSITIES.at(-1);
}
