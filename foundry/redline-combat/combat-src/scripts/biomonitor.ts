export type VitalState = "normal" | "wounded" | "serious" | "critical" | "flatline";
export function vitalState(current: number, maximum: number): VitalState {
  if (current <= 0) return "flatline";
  if (current < 10) return "critical";
  if (current < maximum / 2) return "serious";
  return current < maximum ? "wounded" : "normal";
}
export const lamps = [
  { id: "poison", name: "Яд", icon: "fa-skull-crossbones", match: /poison/i },
  { id: "radiation", name: "Радиация", icon: "fa-radiation", match: /radiation/i },
  { id: "biotoxin", name: "Биотоксин", icon: "fa-biohazard", match: /biotoxin/i },
  { id: "fire", name: "Горит", icon: "fa-fire", match: /on[ _-]?fire|burning|incendiary/i },
  { id: "addict", name: "Зависимость", icon: "fa-pills", match: /addiction|addicted/i },
  { id: "jacked", name: "Подключён к Сети", icon: "pneuma-neural-plug", match: /^jacked in$/i },
  { id: "intrusion", name: "Нейровторжение", icon: "fa-brain", match: /^neural intrusion$/i },
  { id: "unconscious", name: "Без сознания", icon: "fa-bed", match: /unconscious/i },
] as const;
export type LampId = typeof lamps[number]["id"];
const seen = new Map<string, Set<LampId>>();
const activationOrder = new Map<string, LampId[]>();
const flashes = new Map<string, Map<LampId, number>>();
const roundExposures = new Map<string, Set<LampId>>();
const clearedExposures = new Map<string, Set<LampId>>();
const roundKinds: LampId[] = ["poison", "biotoxin"];
/** Read current viewer-local exposure state without changing monitor timing. */
export function hasMonitorExposure(uuid:string,kind:LampId):boolean {
  return !!roundExposures.get(uuid)?.has(kind)
    || (flashes.get(uuid)?.get(kind)??0)>Date.now()
    || (!!seen.get(uuid)?.has(kind)&&!clearedExposures.get(uuid)?.has(kind));
}
/** Clear visual exposure reports, without changing actor effects or damage. */
export function clearRoundExposures() {
  for (const uuid of new Set([...seen.keys(), ...roundExposures.keys()])) {
    clearedExposures.set(uuid, new Set(roundKinds.filter(kind => seen.get(uuid)?.has(kind))));
    for (const kind of roundKinds) flashes.get(uuid)?.delete(kind);
  }
  roundExposures.clear();
}
export function signalExposure(uuid: string, kind: LampId, seconds: number, untilRoundEnd = false) {
  if (!lamps.some(lamp => lamp.id === kind)) return;
  clearedExposures.get(uuid)?.delete(kind);
  if (untilRoundEnd && roundKinds.includes(kind)) {
    const held = roundExposures.get(uuid) ?? new Set<LampId>();
    held.add(kind); roundExposures.set(uuid, held);
  }
  let events = flashes.get(uuid);
  if (!events) { events = new Map(); flashes.set(uuid, events); }
  const order = activationOrder.get(uuid) ?? [];
  if (!order.includes(kind)) order.push(kind);
  activationOrder.set(uuid, order);
  events.set(kind, Date.now() + Math.max(0, Math.min(seconds, 60)) * 1000);
}
export function indicatorState(uuid: string, names: string[], seconds: number, untilRoundEnd = false) {
  const active = new Set<LampId>(names.flatMap(name => lamps.filter(lamp => lamp.match.test(name)).map(lamp => lamp.id)));
  const previous = seen.get(uuid);
  if (previous) for (const kind of active) if (!previous.has(kind)) signalExposure(uuid, kind, seconds, untilRoundEnd);
  seen.set(uuid, new Set(active));
  for (const kind of clearedExposures.get(uuid) ?? []) {
    if (!active.has(kind)) clearedExposures.get(uuid)!.delete(kind);
    else active.delete(kind);
  }
  if (untilRoundEnd) {
    const held = roundExposures.get(uuid) ?? new Set<LampId>();
    for (const kind of roundKinds) if (active.has(kind)) held.add(kind);
    roundExposures.set(uuid, held);
    for (const kind of held) active.add(kind);
  }
  const events = flashes.get(uuid);
  if (!active.has("intrusion")) events?.delete("intrusion");
  if (!active.has("fire") && previous?.has("fire")) events?.delete("fire");
  const now = Date.now();
  for (const [kind, expires] of events ?? []) if (expires <= now) events!.delete(kind);
  if (events && !events.size) flashes.delete(uuid);
  const order = (activationOrder.get(uuid) ?? []).filter(kind => active.has(kind) || events?.has(kind));
  for (const kind of [...active, ...(events?.keys() ?? [])]) if (!order.includes(kind)) order.push(kind);
  activationOrder.set(uuid, order);
  return [...lamps].sort((a, b) => (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 99 : order.indexOf(b.id))).map(lamp => ({ ...lamp, on: active.has(lamp.id) || !!events?.has(lamp.id), flashing: !!events?.has(lamp.id), expires: events?.get(lamp.id) }));
}
export function resetMonitor() { seen.clear(); flashes.clear(); activationOrder.clear(); roundExposures.clear(); clearedExposures.clear(); }

/** Viewer-local playback shared by the personal and hover monitors. */
export let ekgPaused = false;
export function setEKGPaused(paused:boolean):void {
  ekgPaused=paused;
  document.querySelectorAll<SVGSVGElement>('.pneuma-eye-ekg').forEach(svg=>svg.classList.toggle('is-paused',paused));
}
/** Shared visual only; callers supply their own interaction and visibility. */
export function createEKGTrace(state: VitalState | "unknown"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 160 44"); svg.setAttribute("class", "pneuma-eye-ekg");
  svg.classList.toggle("is-paused",ekgPaused);
  const path = state === "flatline" || state === "unknown" ? "M0 22 H160" : state === "critical"
    ? "M0 22 H18 L23 17 27 28 32 8 36 36 40 22 H65 L70 14 74 30 78 22 H110 L114 18 118 25 122 22 H160"
    : "M0 22 H30 L35 18 40 22 H49 L53 28 59 3 65 38 71 22 H92 L100 15 108 22 H160";
  svg.innerHTML = '<path class="pneuma-eye-trace-base" d="' + path + '"/>' +
    '<g class="pneuma-eye-trace"><path class="pneuma-eye-trace-tail" pathLength="100" d="' + path + '"/>' +
    '<path class="pneuma-eye-trace-glow" pathLength="100" d="' + path + '"/>' +
    '<path class="pneuma-eye-trace-dot" pathLength="100" d="' + path + '"/></g>';
  return svg;
}
