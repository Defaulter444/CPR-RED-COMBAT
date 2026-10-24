import { durationExpired } from "../effect-duration.js";
/** Sample the intervals cut by polygon edges, excluding a line that merely grazes smoke. */
export function lineCrossesSmokeCell(a, b, cell) {
    const inside = (p) => {
        let yes = false;
        for (let i = 0, j = cell.length - 2; i < cell.length; j = i, i += 2) {
            const x = cell[i], y = cell[i + 1], u = cell[j], v = cell[j + 1];
            if ((y > p.y) !== (v > p.y) && p.x < (u - x) * (p.y - y) / (v - y) + x)
                yes = !yes;
        }
        return yes;
    };
    if (inside(a) || inside(b))
        return true;
    const dx = b.x - a.x, dy = b.y - a.y, cuts = [0, 1];
    for (let i = 0; i < cell.length; i += 2) {
        const j = (i + 2) % cell.length, x = cell[i], y = cell[i + 1], ex = cell[j] - x, ey = cell[j + 1] - y;
        const cross = dx * ey - dy * ex;
        if (Math.abs(cross) < 1e-9)
            continue;
        const t = ((x - a.x) * ey - (y - a.y) * ex) / cross, u = ((x - a.x) * dy - (y - a.y) * dx) / cross;
        if (t > 0 && t < 1 && u >= 0 && u <= 1)
            cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).some((t, i) => t - cuts[i] > 1e-9 && inside({ x: a.x + dx * (t + cuts[i]) / 2, y: a.y + dy * (t + cuts[i]) / 2 }));
}
/** Check only saved, unexpired smoke footprints in this attack's scene. */
export function attackCrossesSmoke(a, b, scene = canvas.scene) {
    return !!scene?.templates.some(template => {
        const smoke = foundry.utils.getProperty(template, "flags.redline-combat.smoke");
        if (template.hidden || !smoke || (smoke.duration ? durationExpired(smoke.duration) : smoke.expires <= game.time.worldTime))
            return false;
        return smoke.cells.some(cell => lineCrossesSmokeCell(a, b, cell));
    });
}
