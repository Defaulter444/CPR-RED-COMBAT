export function polygon(area) {
    const { origin: o, direction: a, length: l, width: w } = area;
    const u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x };
    const start = area.shape === "square" ? -l / 2 : 0, end = area.shape === "square" ? l / 2 : l;
    return [[start, -w / 2], [end, -w / 2], [end, w / 2], [start, w / 2]].map(([x, y]) => ({ x: o.x + u.x * x + v.x * y, y: o.y + u.y * x + v.y * y }));
}
export function evadeAllowed(ref, mode) { return mode === "everyone" || mode === "raw" && ref >= 8; }
export function winsAreaDefense(defense, attack, ties = false) { return ties ? defense >= attack : defense > attack; }
