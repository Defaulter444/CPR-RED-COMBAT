import { polygon } from "./geometry.js";
/** One document geometry for the native preview and the persistent scene template. */
export function templateData(area, scene = canvas.scene) {
    const scale = Number(scene.grid.size) / Number(scene.grid.distance);
    const origin = area.shape === "square" ? { x: area.origin.x - Math.cos(area.direction) * area.length / 2, y: area.origin.y - Math.sin(area.direction) * area.length / 2 } : area.origin;
    return { t: area.shape === "square" ? "ray" : area.shape, x: origin.x, y: origin.y,
        direction: area.direction * 180 / Math.PI, distance: area.length / scale, width: area.width / scale, angle: area.angle ?? 45,
        fillColor: "#d44a40", borderColor: "#ffffff", user: game.user.id };
}
/** Native scene measurement geometry, clipped by Foundry's movement-wall polygon. */
export function clippedPoints(area) {
    let points;
    if (area.shape === "square")
        points = polygon(area).flatMap(p => [p.x, p.y]);
    else {
        const d = templateData(area), type = CONFIG.MeasuredTemplate.objectClass;
        const shape = area.shape === "cone" ? type.getConeShape(d.distance, d.direction, d.angle)
            : area.shape === "ray" ? type.getRayShape(d.distance, d.direction, d.width) : type.getCircleShape(d.distance);
        const local = shape instanceof PIXI.Polygon ? shape.points
            : Array.from({ length: 120 }, (_, i) => [Math.cos(i * Math.PI / 60) * shape.radius, Math.sin(i * Math.PI / 60) * shape.radius]).flat();
        points = local.map((n, i) => n + (i % 2 ? area.origin.y : area.origin.x));
    }
    const shape = new PIXI.Polygon(points);
    const origin = area.shape === "ray" || area.shape === "cone" ? { x: area.origin.x + Math.cos(area.direction) * 0.1, y: area.origin.y + Math.sin(area.direction) * 0.1 } : area.wallOrigin ?? area.origin;
    const movement = CONFIG.Canvas.polygonBackends.move.create(origin, { type: "move", boundaryShapes: [shape] });
    return CONFIG.Canvas.polygonBackends.sight.create(origin, { type: "sight", boundaryShapes: [movement] }).points;
}
/** Polygon/footprint intersection with positive area; touching an edge is not enough. */
function touches(points, box) {
    let poly = Array.from({ length: points.length / 2 }, (_, i) => ({ x: points[2 * i], y: points[2 * i + 1] }));
    for (const [axis, bound, sign] of [["x", box.x, 1], ["x", box.x + box.width, -1], ["y", box.y, 1], ["y", box.y + box.height, -1]]) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
            if (da >= 0)
                out.push(a);
            if ((da >= 0) !== (db >= 0)) {
                const t = da / (da - db);
                out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
            }
        }
        poly = out;
    }
    return Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) > 0.002;
}
/** Use the same native highlighted cells for targeting as for drawing. */
export function areaCells(area) {
    const shape = new PIXI.Polygon(clippedPoints(area));
    if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS)
        return [shape.points];
    // v12 has no public cell-list API; this native method only reads document origin and shape.
    const native = CONFIG.MeasuredTemplate.objectClass.prototype;
    const d = templateData(area);
    const positions = native._getGridHighlightPositions.call({ document: d,
        shape: new PIXI.Polygon(shape.points.map((n, i) => n - (i % 2 ? d.y : d.x))) });
    return positions.map(p => canvas.grid.getVertices(p).flatMap(v => [v.x, v.y]));
}
export function areaCoverage(area) {
    const cells = areaCells(area);
    return (box) => cells.some(p => touches(p, box));
}
/** Local preview only: players do not need permission to create scene templates. */
export async function placeArea(make, initial, prompt, color = "#d44a40", allowed) {
    if (!canvas.stage || !canvas.app)
        throw new Error("Сначала откройте сцену атаки.");
    canvas.hud?.token?.clear();
    const stage = canvas.stage, view = canvas.app.view;
    let point = initial, area = make(initial);
    const document = new CONFIG.MeasuredTemplate.documentClass({ hidden: allowed ? !allowed(point) : false, ...templateData(area), fillColor: color, borderColor: color, flags: { "redline-combat": { areaShape: area } } }, { parent: canvas.scene });
    const preview = new CONFIG.MeasuredTemplate.objectClass(document);
    canvas.templates.preview.addChild(preview);
    const draw = () => { document.updateSource({ hidden: allowed ? !allowed(point) : false, ...templateData(area), fillColor: color, borderColor: color, flags: { "redline-combat": { areaShape: area } } }); preview.renderFlags.set({ refresh: true }); };
    try {
        await preview.draw();
        draw();
    }
    catch (error) {
        preview.destroy();
        throw error;
    }
    const instructions = window.document.createElement("aside");
    instructions.className = "pneuma-panel pneuma-area-placement";
    instructions.setAttribute("role", "status");
    const heading = window.document.createElement("strong");
    heading.textContent = "Разместите область";
    const detail = window.document.createElement("p");
    detail.textContent = prompt;
    const controls = window.document.createElement("p");
    controls.className = "pneuma-area-placement-controls";
    controls.textContent = "ЛКМ — разместить • ПКМ / Esc — отмена";
    instructions.append(heading, detail, controls);
    window.document.body.append(instructions);
    return new Promise(resolve => {
        let done = false;
        const finish = (value) => {
            if (done)
                return;
            done = true;
            instructions.remove();
            view.removeEventListener("pointermove", move, true);
            view.removeEventListener("pointerdown", click, true);
            view.removeEventListener("contextmenu", cancel, true);
            window.removeEventListener("keydown", key, true);
            Hooks.off("canvasTearDown", teardown);
            preview.destroy();
            resolve(value);
        };
        const move = (event) => {
            const r = view.getBoundingClientRect();
            const p = stage.worldTransform.applyInverse(new PIXI.Point((event.clientX - r.left) * canvas.app.screen.width / r.width, (event.clientY - r.top) * canvas.app.screen.height / r.height));
            point = p;
            area = make(p);
            draw();
        };
        const click = (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (event.button === 0) {
            move(event);
            if (!allowed || allowed(point))
                finish(area);
        }
        else if (event.button !== 2)
            finish(null); };
        const cancel = (event) => { event.preventDefault(); event.stopImmediatePropagation(); finish(null); };
        const key = (event) => { if (event.key === "Escape")
            cancel(event); };
        const teardown = Hooks.on("canvasTearDown", () => finish(null));
        view.addEventListener("pointermove", move, true);
        view.addEventListener("pointerdown", click, true);
        view.addEventListener("contextmenu", cancel, true);
        window.addEventListener("keydown", key, true);
    });
}
