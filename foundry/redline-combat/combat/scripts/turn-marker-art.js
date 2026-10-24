export const MARKER_STYLES = { segmented: "Сегментный HUD", scanner: "Сканер", glitch: "Векторный след", echo: "Эхо сигнала", stream: "Поток данных", arc: "Дуговой разряд", rockerboy: "Рокербой — звуковая волна", solo: "Соло — управление огнём", netrunner: "Нетраннер — квадрантная схема", tech: "Техник — диагностика", medtech: "Медтех — травматологическая поддержка", media: "Медиа — прямой эфир", exec: "Корпорат — корпоративная власть", lawman: "Законник — диспетчерская", fixer: "Фиксер — поток евробаксов", nomad: "Кочевник — красная зона" };
/** Build once. Animation changes only cached transforms, visibility and alpha. */
export function createMarkerArt(radius, options) {
    const root = new PIXI.Container();
    root.eventMode = "none";
    root.alpha = options.opacity;
    const updates = [], r = radius, tau = Math.PI * 2, w = options.thickness;
    const line = (draw, alpha = 1, color = options.color, width = w) => {
        const g = new PIXI.Graphics();
        g.eventMode = "none";
        g.alpha = alpha;
        g.lineStyle(width + Math.max(.8, width * .45), 0x09111b, 1);
        draw(g);
        g.lineStyle(width, color, 1);
        draw(g);
        root.addChild(g);
        return g;
    };
    const path = (points, alpha = .6, width = w, color = options.color) => line(g => { g.moveTo(points[0][0] * r, points[0][1] * r); for (let i = 1; i < points.length; i++)
        g.lineTo(points[i][0] * r, points[i][1] * r); }, alpha, color, width);
    const arc = (rad, a, b, alpha = .7) => line(g => { g.moveTo(Math.cos(a) * rad * r, Math.sin(a) * rad * r); g.arc(0, 0, rad * r, a, b); }, alpha);
    const square = (x, y, size = .045, alpha = .8) => path([[x - size, y - size], [x + size, y - size], [x + size, y + size], [x - size, y + size], [x - size, y - size]], alpha);
    const pulse = (node, offset = 0, min = .25) => updates.push(p => { node.alpha = min + (1 - min) * (.5 + .5 * Math.sin(tau * (p + offset))); });
    const packet = (points, offset = 0, rate = 1) => {
        const lengths = points.slice(1).map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
        const total = lengths.reduce((a, b) => a + b, 0), size = Math.max(r * .019, Math.min(w * .65, r * .04));
        const dot = line(g => { g.moveTo(-size, 0); g.lineTo(size, 0); }, 1, options.color, Math.max(1, w * .65));
        updates.push(p => {
            const f = (p * rate + offset) % 1;
            let d = f * total;
            for (let i = 0; i < lengths.length; i++) {
                const len = lengths[i];
                if (d > len) {
                    d -= len;
                    continue;
                }
                const a = points[i], b = points[i + 1], t = d / len;
                dot.position.set((a[0] + (b[0] - a[0]) * t) * r, (a[1] + (b[1] - a[1]) * t) * r);
                dot.rotation = Math.atan2(b[1] - a[1], b[0] - a[0]);
                break;
            }
            dot.alpha = Math.min(1, f * 12, (1 - f) * 12);
        });
    };
    const corners = (size = 1, cut = .28) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => path([[x * size, y * (size - cut)], [x * size, y * size], [x * (size - cut), y * size]], .9));
    const ticks = (a, b, count, rad = 1) => { for (let i = 0; i < count; i++) {
        const angle = a + (b - a) * i / (count - 1), len = i % 4 === 0 ? .13 : .06;
        path([[Math.cos(angle) * rad, Math.sin(angle) * rad], [Math.cos(angle) * (rad + len), Math.sin(angle) * (rad + len)]], .65);
    } };
    const style = options.style;
    if (style === "segmented") {
        for (let n = 0; n < 8; n++)
            arc(1, n * tau / 8 + .06, (n + 1) * tau / 8 - .10, .4);
        const moving = [arc(1, 0, .55, 1), arc(1, Math.PI, Math.PI + .55, 1)];
        updates.push(p => { for (const node of moving)
            node.rotation = p * tau; });
    }
    else if (style === "scanner") {
        const nodes = [];
        for (let n = 0; n < 40; n++) {
            const a = n * tau / 40;
            nodes.push(path([[Math.cos(a), Math.sin(a)], [Math.cos(a) * (n % 5 === 0 ? 1.13 : 1.07), Math.sin(a) * (n % 5 === 0 ? 1.13 : 1.07)]], .22));
        }
        const sweep = arc(.94, -.35, 0, 1), needle = path([[.88, 0], [1.2, 0]], 1);
        updates.push(p => { sweep.rotation = needle.rotation = p * tau; for (let n = 0; n < nodes.length; n++) {
            const age = (p - n / 40 + 1) % 1;
            nodes[n].alpha = age < .2 ? 1 - age * 3.5 : .22;
        } });
    }
    else if (style === "netrunner" || style === "circuit") {
        // Four independently routed groups. Boundary-crossing traces hide the quadrant seams.
        const routes = [
            [[-.25, -.3], [-.25, -.92], [-.67, -.92], [-.67, -1.42]],
            [[-.43, -.22], [-.43, -.75], [-.88, -.75], [-1.24, -1.08]],
            [[-.3, -.1], [-.88, -.1], [-.88, -.46], [-1.46, -.46]],
            [[.04, -.2], [.04, -1.16], [-.29, -1.16], [-.29, -1.55]],
            [[.2, -.3], [.2, -.94], [.61, -1.35], [1.02, -1.35]],
            [[.36, -.24], [.36, -.82], [.83, -.82], [1.18, -1.17], [1.48, -1.17]],
            [[.3, -.06], [1.04, -.06], [1.04, -.57], [1.51, -.57]],
            [[.52, .14], [1.27, .14], [1.27, -.27], [1.56, -.27]],
            [[.18, .24], [.91, .24], [.91, .66], [1.48, .66]],
            [[.3, .43], [.68, .43], [.68, .94], [1.15, .94], [1.15, 1.42]],
            [[.04, .31], [.04, 1.07], [.37, 1.07], [.37, 1.54]],
            [[-.14, .5], [-.14, 1.27], [.65, 1.27], [.65, 1.48]],
            [[-.31, .22], [-.89, .22], [-1.27, .6], [-1.53, .6]],
            [[-.38, .4], [-.66, .4], [-.66, .88], [-1.13, .88], [-1.13, 1.34]],
            [[-.24, .3], [-.24, .99], [-.47, .99], [-.47, 1.48]],
            [[-.52, -.02], [-1.17, -.02], [-1.17, .27], [-1.48, .27]],
        ];
        routes.forEach((points, i) => { path(points, .48, w * .65); const end = points.at(-1); square(end[0], end[1], .025, .7); packet(points, i * .173, 1.5 / points.reduce((sum, b, j) => j ? sum + Math.hypot(b[0] - points[j - 1][0], b[1] - points[j - 1][1]) : 0, 0)); });
    }
    else if (style === "glitch") {
        // Three orbital arrowheads with layered curved wakes, replacing the old glitch frame.
        for (let i = 0; i < 3; i++) {
            const head = path([[1.03, -.055], [1.16, .16], [1.29, -.055], [1.16, .015], [1.03, -.055]], 1, w * .85);
            head.name = "wake-head";
            const tails = [arc(1.16, -.7, -.15, .65), arc(1.16, -1.03, -.76, .35), arc(1.16, -1.22, -1.09, .15)];
            updates.push(p => { const angle = p * tau + i * tau / 3; head.rotation = angle; for (const tail of tails)
                tail.rotation = angle; });
        }
    }
    else if (style === "echo") {
        for (let i = 0; i < 3; i++) {
            const nodes = [arc(1, -2.7, -1.7), arc(1, .15, 1.1)];
            updates.push(p => { const f = (p + i / 3) % 1; for (const node of nodes) {
                node.scale.set(.95 + f * .55);
                node.alpha = (1 - f) * .8;
            } });
        }
    }
    else if (style === "stream") {
        for (let i = 0; i < 9; i++) {
            const x = (i - 4) * .29;
            for (let j = 0; j < 4; j++) {
                const node = path([[x, 0], [x, .06 + (i % 3) * .02]], .7, w * .85);
                updates.push(p => { const f = (p * (.7 + i * .043) + j / 4 + i * .13) % 1; node.y = (-1.5 + f * 3) * r; node.alpha = Math.min(1, f * 8, (1 - f) * 8) * .7; });
            }
        }
    }
    else if (style === "arc") {
        // Cache three jagged routes between each neighboring pair; flashes only switch visibility.
        const angles = [-.20, .72, 1.83, 2.78, 3.86, 5.05], contacts = [];
        const bolts = [];
        const polar = (a, rad) => [Math.cos(a) * rad, Math.sin(a) * rad];
        angles.forEach((a, i) => {
            const point = polar(a, 1.10), contact = square(point[0], point[1], .025, .3);
            contact.name = "arc-contact";
            contacts.push(contact);
            const end = i === angles.length - 1 ? angles[0] + tau : angles[i + 1];
            for (let variant = 0; variant < 3; variant++) {
                const points = [];
                for (let j = 0; j <= 8; j++) {
                    const f = j / 8, angle = a + (end - a) * f, offset = j === 0 || j === 8 ? 0 : .035 + .10 * (.5 + .5 * Math.sin(j * 8.7 + i * 3.1 + variant * 5.3));
                    points.push(polar(angle, 1.10 + offset));
                }
                const main = path(points, 0, w * .9);
                main.name = "arc-bolt";
                const branchAngle = a + (end - a) * .5, branch = [points[4], polar(branchAngle + .07, 1.29), polar(branchAngle - .02, 1.36)];
                const fork = path(branch, 0, w * .6);
                fork.name = "arc-fork";
                bolts.push({ main, fork, gap: i, variant });
            }
        });
        const order = [0, 3, 1, 5, 2, 4, 1, 4, 0, 2, 5, 3];
        updates.push(p => {
            const time = p * 18, slot = Math.floor(time), flash = time - slot < .8, gap = order[slot % order.length], variant = slot % 3;
            const second = slot % 4 === 0 ? (gap + 3) % 6 : -1;
            for (const bolt of bolts) {
                const active = flash && (bolt.gap === gap || bolt.gap === second) && bolt.variant === variant;
                bolt.main.alpha = active ? 1 : 0;
                bolt.fork.alpha = active ? .65 : 0;
            }
            for (let i = 0; i < contacts.length; i++)
                contacts[i].alpha = flash && (i === gap || i === (gap + 1) % 6 || i === second || i === (second + 1) % 6 && second >= 0) ? 1 : .22;
        });
    }
    else if (style === "rockerboy") {
        const wave = [];
        for (let i = 0; i <= 144; i++) {
            const a = i * tau / 144, rad = 1.05 + .05 * Math.sin(i * 2.3) + .045 * Math.sin(i * .7);
            wave.push([Math.cos(a) * rad, Math.sin(a) * rad]);
        }
        pulse(path(wave, .9, w * .75), 0, .6);
        for (const side of [-1, 1])
            for (let i = 0; i < 7; i++) {
                const colors = [0x36dc68, 0x68e342, 0xace538, 0xffe54b, 0xffb52b, 0xff782b, 0xff3030];
                const node = path([[side * 1.2, .36 - i * .1], [side * 1.38, .36 - i * .1]], .8, w, colors[i]);
                node.name = "rocker-level-" + i;
                updates.push(p => { node.alpha = i < 1 + (.5 + .5 * Math.sin(p * tau * 2 + side)) * 6.5 ? 1 : .15; });
            }
    }
    else if (style === "solo") {
        const locks = corners(1, .24);
        locks.forEach(node => { node.name = "solo-lock"; });
        updates.push(p => { const size = 1 + .10 * Math.sin(p * tau); for (const node of locks)
            node.scale.set(size); });
        ticks(-1.9, -1.25, 7, 1.2);
        ticks(-.3, .3, 7, 1.2);
        ticks(1.25, 1.9, 7, 1.2);
        const target = path([[-1.38, 0], [-.94, 0]], 1);
        target.name = "solo-scan";
        updates.push(p => { target.y = Math.sin(p * tau) * r * .65; target.alpha = .7 + .3 * Math.cos(p * tau * 2); });
    }
    else if (style === "tech") {
        // Asymmetric equipment diagnostics: mounting brackets, calibration and component checks.
        corners(1.06, .22);
        path([[-1.22, -.64], [-1.22, .64]], .5, w * .6);
        for (let i = 0; i < 9; i++)
            path([[-1.22, -.6 + i * .15], [-1.22 - (i % 2 === 0 ? .12 : .065), -.6 + i * .15]], .65, w * .55);
        const cursor = path([[-1.43, -.065], [-1.31, 0], [-1.43, .065]], 1, w * .85);
        cursor.name = "tech-cursor";
        updates.push(p => { cursor.y = Math.sin(p * tau) * r * .57; });
        for (let i = 0; i < 3; i++) {
            const y = -.48 + i * .48;
            path([[1.14, y - .13], [1.45, y - .13], [1.45, y + .13], [1.14, y + .13]], .45, w * .55);
            const check = path([[1.2, y], [1.26, y + .055], [1.38, y - .065]], 1, w * .65);
            check.name = "tech-check";
            updates.push(p => { check.alpha = (p % 1) * 3 >= i ? .95 : .13; });
        }
        path([[-.55, 1.17], [-.55, 1.35], [.55, 1.35], [.55, 1.17]], .5, w * .55);
        for (let i = 0; i < 8; i++) {
            const segment = path([[-.47 + i * .13, 1.25], [-.39 + i * .13, 1.25]], 1, w * 1.2);
            segment.name = "tech-progress";
            updates.push(p => { segment.alpha = i < (p % 1) * 8 ? 1 : .12; });
        }
    }
    else if (style === "medtech") {
        // Twin treatment cartridges and a medical shield; no EKG trace.
        for (const side of [-1, 1]) {
            const x = side * 1.15;
            path([[x - .13, -.48], [x + .13, -.48], [x + .13, .38], [x + .07, .49], [x - .07, .49], [x - .13, .38], [x - .13, -.48]], .8, w * .65);
            path([[x - .08, -.57], [x + .08, -.57]], 1, w * .75);
            path([[x, .49], [x, .68], [side * .77, .96]], .55, w * .6);
            for (let i = 0; i < 5; i++) {
                const fill = path([[x - .065, .29 - i * .14], [x + .065, .29 - i * .14]], .8, w * .85);
                fill.name = "medtech-dose";
                updates.push(p => { fill.alpha = i < 1 + ((p * .7 + (side > 0 ? .5 : 0)) % 1) * 5 ? .95 : .16; });
            }
            const probe = path([[x - .19, -.12], [x - .19, -.2], [x + .19, -.2], [x + .19, -.12]], 1, w * .65);
            probe.name = "medtech-probe";
            updates.push(p => { probe.y = Math.sin(p * tau) * r * .22; });
        }
        path([[-.28, 1.0], [0, .92], [.28, 1.0], [.23, 1.3], [0, 1.46], [-.23, 1.3], [-.28, 1.0]], .85, w * .7);
        const cross = path([[-.045, 1.04], [.045, 1.04], [.045, 1.13], [.14, 1.13], [.14, 1.22], [.045, 1.22], [.045, 1.32], [-.045, 1.32], [-.045, 1.22], [-.14, 1.22], [-.14, 1.13], [-.045, 1.13], [-.045, 1.04]], 1, w * .65, 0xff3030);
        cross.name = "medtech-cross";
        pulse(cross, 0, .75);
        arc(1.1, -2.03, -1.12, .6);
        const scan = arc(1.1, -1.85, -1.55, 1);
        updates.push(p => { scan.rotation = Math.sin(p * tau) * .15; });
    }
    else if (style === "media") {
        corners(1.1, .3);
        const lamp = new PIXI.Graphics();
        lamp.name = "media-lamp";
        lamp.eventMode = "none";
        lamp.beginFill(0x09111b).drawCircle(0, 0, r * .115).endFill();
        lamp.beginFill(0xff3030).drawCircle(0, 0, r * .09).endFill();
        lamp.position.set(r * .87, -r * .88);
        root.addChild(lamp);
        updates.push(p => { lamp.alpha = (p * 2) % 1 < .5 ? 1 : .12; });
        // Cached vector LIVE lettering remains sharp without a font texture or per-frame text work.
        const live = line(g => {
            const strokes = [[[0, 0], [0, .15], [.075, .15]], [[.12, 0], [.12, .15]], [[.17, 0], [.215, .15], [.26, 0]], [[.385, 0], [.305, 0], [.305, .15], [.385, .15]], [[.305, .075], [.37, .075]]];
            for (const points of strokes) {
                g.moveTo(points[0][0] * r, points[0][1] * r);
                for (const [x, y] of points.slice(1))
                    g.lineTo(x * r, y * r);
            }
        }, 1, 0xff3030, Math.min(w * .8, r * .018));
        live.name = "media-live";
        live.position.set(-1.0 * r, .88 * r);
        for (const side of [-1, 1])
            for (let i = 0; i < 3; i++) {
                const node = path([[side * 1.1, -.13 + i * .14], [side * 1.45, -.13 + i * .14]], .5);
                pulse(node, i * .2, .15);
            }
    }
    else if (style === "exec") {
        // Corporate authority: a monumental stepped crest and commands radiating outward.
        const crest = path([[-.56, -1.02], [-.56, -1.14], [-.34, -1.14], [-.34, -1.3], [-.13, -1.3], [-.13, -1.48], [.13, -1.48], [.13, -1.3], [.34, -1.3], [.34, -1.14], [.56, -1.14], [.56, -1.02], [-.56, -1.02]], .95, w * .75);
        crest.name = "exec-crest";
        for (const x of [-.24, 0, .24])
            path([[x, -1.08], [x, -1.23 + (x === 0 ? -.15 : 0)]], .55, w * .5);
        for (const side of [-1, 1]) {
            path([[side * .68, -.99], [side * 1.06, -.78], [side * 1.17, -.55], [side * 1.17, .55], [side * 1.06, .78], [side * .68, .99]], .75, w * .85);
            path([[side * .82, -.78], [side * 1.0, -.63], [side * 1.0, .63], [side * .82, .78]], .3, w * .55);
            for (let i = 0; i < 3; i++) {
                const command = path([[side * 1.2, -.12], [side * 1.32, 0], [side * 1.2, .12]], 1, w * .7);
                command.name = "exec-command";
                updates.push(p => { const f = (p * .65 + i / 3) % 1; command.x = side * f * r * .22; command.alpha = Math.sin(f * Math.PI) * .9; });
            }
        }
        for (let i = 0; i < 3; i++) {
            const half = .48 - i * .13, rank = path([[-half, 1.05 + i * .13], [0, 1.13 + i * .13], [half, 1.05 + i * .13]], .85, w * .8);
            rank.name = "exec-rank";
            updates.push(p => { rank.alpha = .5 + .5 * (.5 + .5 * Math.sin(p * tau - i * .8)); });
        }
    }
    else if (style === "lawman") {
        for (const side of [-1, 1]) {
            const color = side < 0 ? 0x449fff : 0xff3030;
            path([[side * .23, -1.1], [side * .9, -1.1], [side * 1.15, -.85], [side * 1.15, -.55]], .6, w, color);
            path([[side * .23, 1.1], [side * .9, 1.1], [side * 1.15, .85], [side * 1.15, .55]], .6, w, color);
            for (let i = 0; i < 7; i++) {
                const y = -.38 + i * .125, node = line(g => { g.moveTo(side * 1.13 * r, y * r); g.lineTo(side * 1.31 * r, y * r); }, 1, color, w * 1.35);
                updates.push(p => { node.alpha = (Math.sin(p * tau * 2) * (side) > 0) ? 1 : .16; });
            }
        }
    }
    else if (style === "fixer") {
        // A Eurobuck readout and moving banknotes make this a money effect, not a contact graph.
        path([[-.45, 1.02], [.45, 1.02], [.54, 1.11], [.54, 1.4], [.45, 1.49], [-.45, 1.49], [-.54, 1.4], [-.54, 1.11], [-.45, 1.02]], .65);
        const currency = line(g => {
            // Euro glyph, followed by a dollar glyph; both are cached vector strokes.
            const cx = -.19 * r, cy = 1.25 * r, rad = .155 * r;
            g.moveTo(cx + Math.cos(.7) * rad, cy + Math.sin(.7) * rad);
            g.arc(cx, cy, rad, .7, tau - .7);
            g.moveTo(-.39 * r, 1.20 * r);
            g.lineTo(-.12 * r, 1.20 * r);
            g.moveTo(-.39 * r, 1.29 * r);
            g.lineTo(-.12 * r, 1.29 * r);
            g.moveTo(.34 * r, 1.12 * r);
            g.lineTo(.12 * r, 1.12 * r);
            g.lineTo(.07 * r, 1.18 * r);
            g.lineTo(.12 * r, 1.24 * r);
            g.lineTo(.29 * r, 1.27 * r);
            g.lineTo(.34 * r, 1.33 * r);
            g.lineTo(.28 * r, 1.39 * r);
            g.lineTo(.07 * r, 1.39 * r);
            g.moveTo(.205 * r, 1.06 * r);
            g.lineTo(.205 * r, 1.45 * r);
        }, 1, options.color, w * .8);
        currency.name = "fixer-currency";
        pulse(currency, 0, .7);
        for (const side of [-1, 1]) {
            path([[side * .92, -.95], [side * 1.32, -.95], [side * 1.39, -.88]], .45);
            path([[side * 1.39, .83], [side * 1.32, .91], [side * .92, .91]], .45);
            for (let i = 0; i < 3; i++) {
                const bill = line(g => {
                    const x = .19 * r, y = .10 * r;
                    g.moveTo(-x, -y);
                    g.lineTo(x, -y);
                    g.lineTo(x, y);
                    g.lineTo(-x, y);
                    g.lineTo(-x, -y);
                    g.moveTo(-.045 * r, -.045 * r);
                    g.lineTo(.045 * r, -.045 * r);
                    g.lineTo(-.045 * r, .045 * r);
                    g.lineTo(.045 * r, .045 * r);
                    g.moveTo(0, -.07 * r);
                    g.lineTo(0, .07 * r);
                    g.moveTo(-.145 * r, 0);
                    g.lineTo(-.105 * r, 0);
                    g.moveTo(.105 * r, 0);
                    g.lineTo(.145 * r, 0);
                }, 1, options.color, w * .65);
                bill.name = "fixer-banknote";
                updates.push(p => { const progress = (p + i / 3 + (side > 0 ? .17 : 0)) % 1; bill.position.set(side * 1.16 * r, (side < 0 ? .76 - progress * 1.5 : -.74 + progress * 1.5) * r); bill.alpha = Math.min(1, progress * 8, (1 - progress) * 8); });
            }
        }
    }
    else if (style === "nomad") {
        // A cached, segmented color ramp follows the speed scale from low to high.
        const stops = [0x36dc68, 0xffe54b, 0xff941f, 0xff3030];
        const ramp = (t) => { const f = Math.min(2.999999, Math.max(0, t) * 3), i = Math.floor(f), a = stops[i], b = stops[i + 1], mix = f - i; return [16, 8, 0].reduce((color, shift) => color | (Math.round(((a >> shift) & 255) * (1 - mix) + ((b >> shift) & 255) * mix) << shift), 0); };
        const speedArc = new PIXI.Graphics();
        speedArc.name = "nomad-speed-arc";
        speedArc.eventMode = "none";
        root.addChild(speedArc);
        speedArc.lineStyle(w + Math.max(.8, w * .45), 0x09111b, 1).moveTo(Math.cos(-1.25) * r * 1.15, Math.sin(-1.25) * r * 1.15).arc(0, 0, r * 1.15, -1.25, 2.1);
        for (let i = 0; i < 64; i++) {
            const a = -1.25 + i * 3.35 / 64, b = a + 3.35 / 64;
            speedArc.lineStyle(w, ramp(i / 63), 1).moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15).arc(0, 0, r * 1.15, a, b);
        }
        for (let i = 0; i < 13; i++) {
            const a = 2.05 - i * 3.15 / 12, len = i % 4 === 0 ? .13 : .06;
            path([[Math.cos(a) * 1.02, Math.sin(a) * 1.02], [Math.cos(a) * (1.02 + len), Math.sin(a) * (1.02 + len)]], .8, w, ramp(1 - i / 12));
        }
        const needle = path([[.84, 0], [1.19, 0]], 1);
        updates.push(p => { needle.rotation = -.9 + (.5 + .5 * Math.sin(p * tau)) * 2.5; });
        for (let i = 0; i < 6; i++) {
            const x = -1.03 - (i % 3) * .24, y = .25 + Math.floor(i / 3) * .18;
            const node = path([[x, y], [x - .13, y]], .8);
            pulse(node, i * .15, .2);
        }
    }
    function frame(phase) { for (const update of updates)
        update(phase); }
    frame(.08);
    return { root, frame };
}
