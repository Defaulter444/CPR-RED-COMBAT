import { sceneEncounter } from "../encounter.js";
import { effectDuration, durationExpired } from "../effect-duration.js";
import { areaCells, templateData } from "./placement.js";
import { empGM } from "../emp-state.js";
const M = "redline-combat";
const smoke = (d) => foundry.utils.getProperty(d, "flags." + M + ".smoke");
/** Scene-owned footprint stays independent of the attack card and later wall changes. */
export async function createSmoke(scene, area, source, combat = sceneEncounter(scene.id)) {
    const old = scene.templates.find(d => smoke(d)?.source === source);
    if (old)
        return old.id;
    if (canvas.scene?.id !== scene.id)
        throw Error("Откройте сцену попадания, чтобы создать дым.");
    const cells = areaCells(area), created = game.time.worldTime;
    const docs = await scene.createEmbeddedDocuments("MeasuredTemplate", [{ ...templateData(area, scene), fillColor: "#a7afb7", borderColor: "#a7afb7", flags: { [M]: { smoke: { cells, created, expires: created + 60, source, duration: effectDuration(60, combat) } } } }]);
    if (!docs?.[0])
        throw Error("Не удалось создать область дыма.");
    return docs[0].id;
}
const drawings = new Map();
function remove(id) { const old = drawings.get(id); if (!old)
    return; canvas.app?.ticker.remove(old.tick); old.container.destroy({ children: true }); drawings.delete(id); }
let puff;
function smokeTexture() {
    if (puff)
        return puff;
    const image = document.createElement("canvas");
    image.width = image.height = 128;
    const ctx = image.getContext("2d");
    for (const [x, y, r] of [[64, 64, 62], [43, 59, 39], [82, 45, 37], [72, 83, 38]]) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, "rgba(220,225,230,0.65)");
        gradient.addColorStop(.45, "rgba(210,218,224,0.35)");
        gradient.addColorStop(1, "rgba(190,200,210,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
    }
    return puff = PIXI.Texture.from(image);
}
function draw(document) {
    remove(document.id);
    const data = smoke(document);
    if (!data || document.hidden || (data.duration ? durationExpired(data.duration) : data.expires <= game.time.worldTime) || !canvas.primary || !canvas.app)
        return;
    const container = new PIXI.Container(), mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    for (const cell of data.cells)
        mask.drawPolygon(cell);
    mask.endFill();
    container.addChild(mask);
    container.mask = mask;
    container.eventMode = "none";
    // Primary-canvas rendering preserves scene fog/vision; token artwork remains above the smoke.
    Object.assign(container, { elevation: 0, sortLayer: 650 });
    const particles = [];
    for (const [index, cell] of data.cells.entries()) {
        const xs = cell.filter((_, i) => i % 2 === 0), ys = cell.filter((_, i) => i % 2 === 1);
        if (!xs.length)
            continue;
        const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
        const radius = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.62;
        for (let n = 0; n < 3; n++) {
            const g = new PIXI.Sprite(smokeTexture());
            g.anchor.set(.5);
            g.alpha = .4;
            g.tint = n % 2 ? 0xd7e0e6 : 0x9fadb8;
            container.addChild(g);
            particles.push({ g, x, y, phase: index * 1.73 + n * 2.1, radius });
        }
    }
    let phase = 0;
    const tick = (delta) => { phase += Math.min(delta, 3) * 0.012; for (const p of particles) {
        const a = phase + p.phase;
        p.g.position.set(p.x + Math.sin(a) * p.radius * .32, p.y + Math.cos(a * .8) * p.radius * .18);
        p.g.width = p.g.height = p.radius * 2.8 * (.94 + .1 * Math.sin(a * .7));
        p.g.rotation = .08 * Math.sin(a * .5);
    } };
    tick(0);
    canvas.primary.addChild(container);
    canvas.app.ticker.add(tick);
    drawings.set(document.id, { container, tick });
}
export async function expireSmoke() { if (game.user?.id !== empGM()?.id)
    return; for (const scene of game.scenes ?? []) {
    const ids = scene.templates.filter(d => !!smoke(d) && (smoke(d).duration ? durationExpired(smoke(d).duration) : smoke(d).expires <= game.time.worldTime)).map(d => d.id);
    if (ids.length)
        await scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
} }
async function finishCombatSmoke(combat) {
    if (game.user?.id !== empGM()?.id)
        return;
    for (const scene of game.scenes ?? []) {
        const ids = scene.templates.filter(d => { const data = smoke(d); return !!data && data.duration?.combat === combat.id; }).map(d => d.id);
        if (ids.length)
            await scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
    }
}
function refreshSmokeCard(document) {
    const source = smoke(document)?.source, message = (source ? game.messages?.get(source) : undefined);
    if (message?.visible)
        ui.chat?.updateMessage(message, false);
}
export function registerSmoke() {
    Hooks.on("canvasTearDown", () => { for (const id of [...drawings.keys()])
        remove(id); });
    Hooks.on("canvasReady", () => { for (const d of canvas.scene?.templates ?? [])
        if (smoke(d))
            draw(d); void expireSmoke(); });
    Hooks.on("updateCombat", (combat, changes) => { if (changes.round === undefined && changes.turn === undefined)
        return; if (changes.round !== undefined && !combat.started)
        void finishCombatSmoke(combat);
    else
        void expireSmoke(); });
    Hooks.on("deleteCombat", (combat) => { void finishCombatSmoke(combat); });
    Hooks.once("ready", () => { void expireSmoke(); });
    Hooks.on("updateWorldTime", () => { for (const d of canvas.scene?.templates ?? [])
        if (smoke(d) && (smoke(d).duration ? durationExpired(smoke(d).duration) : smoke(d).expires <= game.time.worldTime))
            remove(d.id); void expireSmoke(); });
    Hooks.on("createMeasuredTemplate", (d) => { if (d.parent?.id === canvas.scene?.id && smoke(d))
        draw(d); });
    Hooks.on("updateMeasuredTemplate", (d) => { if (d.parent?.id === canvas.scene?.id && smoke(d))
        draw(d); refreshSmokeCard(d); });
    Hooks.on("deleteMeasuredTemplate", (d) => { remove(d.id); refreshSmokeCard(d); });
    Hooks.on("refreshMeasuredTemplate", (t) => { if (!smoke(t.document))
        return; t.template?.clear(); const h = canvas.interface?.grid.getHighlightLayer(t.highlightId); if (h)
        h.visible = false; });
}
