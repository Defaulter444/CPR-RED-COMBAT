import { tokenPositionOnly } from "./update-path.js";
import { openCombatBarSettings } from "./combat-bar-settings.js";
import { barCombat, barEntries, canEndTurn, movementMode, MOVEMENT_MODES, registerBarMovement, validMode } from "./combat-bar-state.js";
import { requestEndTurn, registerBarTurns } from "./combat-bar-turn.js";
import { showBarStatuses, showBarControls, showBarInitiative, closeBarFlyout, invalidateBarStatuses, leaveBarFlyout, navigateBarEntry } from "./combat-bar-flyout.js";
const MODULE = "redline-combat";
let root;
let observer;
let players = null;
let frame = 0;
let renderKey = "";
let turnPending = false;
let modePending = false;
let hold;
let suppressClick = false;
const report = (error) => ui.notifications.error(error instanceof Error ? error.message : String(error));
function cancelHold() {
    if (hold)
        window.clearTimeout(hold.timer);
    hold = undefined;
}
function position() {
    if (!root)
        return;
    const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
    const edge = sidebar?.width ? sidebar.left : window.innerWidth;
    const controls = document.getElementById("controls");
    const layers = [];
    for (let node = controls; node; node = node.parentElement) {
        const z = Number.parseInt(getComputedStyle(node).zIndex);
        if (Number.isFinite(z) && z > 0)
            layers.push(z);
    }
    root.style.zIndex = String(layers.length ? Math.max(0, Math.min(...layers) - 1) : 19);
    if (root.dataset.dock === "top-right") {
        root.style.left = "auto";
        root.style.bottom = "auto";
        root.style.top = "8px";
        root.style.right = Math.max(8, window.innerWidth - edge + 8) + "px";
        root.style.maxHeight = Math.max(100, window.innerHeight - 24) + "px";
        root.style.maxWidth = Math.max(150, edge - 24) + "px";
        positionEndTurn();
        return;
    }
    root.style.top = "auto";
    root.style.right = "auto";
    const anchor = players?.getBoundingClientRect();
    const visible = anchor && anchor.width > 0 && anchor.height > 0;
    let top = visible ? anchor.top : window.innerHeight - 12;
    // Horizontal portraits extend over the macro area when Players is collapsed.
    const hotbar = document.getElementById("hotbar");
    const macros = hotbar?.getBoundingClientRect();
    if (root.dataset.orientation === "horizontal" && macros && macros.width > 0 && macros.height > 0
        && getComputedStyle(hotbar).visibility !== "hidden"
        && 15 + root.offsetWidth > macros.left && 15 < macros.right) {
        top = Math.min(top, macros.top);
    }
    root.style.left = "15px";
    root.style.bottom = String(window.innerHeight - top + 6) + "px";
    const mainControls = Array.from(controls?.querySelectorAll(":scope > ol.main-controls > li, :scope > ol > li.scene-control") ?? [])
        .map(button => button.getBoundingClientRect()).filter(bounds => bounds.width > 0 && bounds.height > 0);
    const controlsBottom = mainControls.length ? Math.max(...mainControls.map(bounds => bounds.bottom)) : controls?.getBoundingClientRect().bottom ?? 8;
    root.style.maxHeight = root.dataset.orientation === "vertical"
        ? Math.max(0, top - 6 - controlsBottom - 8) + "px"
        : Math.max(100, top - 16) + "px";
    root.style.maxWidth = `${Math.max(150, (sidebar?.width ? sidebar.left : window.innerWidth) - 30)}px`;
    positionEndTurn();
}
function positionEndTurn() {
    const end = root?.querySelector(".pneuma-bar-end");
    const active = root?.querySelector("li.active");
    const list = root?.querySelector("ol");
    if (!end || !active || !list || !root)
        return;
    const row = active.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    const horizontal = root.dataset.orientation === "horizontal";
    // Only the list's scrolling axis determines visibility. Themes and scrollbars can
    // make the portrait slightly wider/taller than the list on the other axis.
    end.hidden = horizontal ? row.right <= bounds.left || row.left >= bounds.right
        : row.bottom <= bounds.top || row.top >= bounds.bottom;
    const bar = root.getBoundingClientRect();
    const topRight = root.dataset.dock === "top-right";
    const x = horizontal ? row.left + (row.width - 56) / 2 : topRight ? bar.left - 60 : bar.right + 4;
    const y = horizontal ? topRight ? bar.bottom + 4 : bar.top - 28 : row.top + (row.height - 24) / 2;
    // Viewport coordinates keep the control out of app/scroll clipping in themed HUDs.
    end.style.position = "fixed";
    end.style.left = Math.max(4, Math.min(window.innerWidth - 60, x)) + "px";
    end.style.top = Math.max(4, Math.min(window.innerHeight - 28, y)) + "px";
    end.style.right = end.style.bottom = "auto";
}
function button(text, title, action) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = text;
    control.title = title;
    control.setAttribute("aria-label", title);
    control.dataset.action = action;
    return control;
}
function row(entry) {
    const element = document.createElement("li");
    element.className = "combatant";
    element.dataset.entryId = entry.id;
    element.classList.toggle("active", entry.active);
    element.classList.toggle("is-hidden", entry.hidden);
    element.classList.toggle("defeated", entry.defeated);
    element.classList.toggle("controlled", !!entry.token?.controlled);
    if (entry.active)
        element.setAttribute("aria-current", "step");
    const title = game.settings.get(MODULE, "combatBarNameOnly") ? entry.name
        : `${entry.name} — щелчок: выбрать; удержание: метка; Shift+щелчок: к токену; двойной щелчок: лист${game.user?.isGM ? "; Shift+удержание: показать игрокам" : ""}`;
    const portrait = button("", title, "token");
    portrait.className = "pneuma-bar-token";
    portrait.disabled = !entry.token && !entry.combatant?.actor && !entry.actor;
    const img = document.createElement("img");
    img.src = entry.img;
    img.alt = "";
    img.draggable = false;
    img.width = img.height = 40;
    portrait.append(img);
    element.append(portrait);
    if (entry.hidden) {
        const hidden = document.createElement("i");
        hidden.className = "fas fa-eye-slash";
        hidden.title = "Скрыт от игроков";
        hidden.setAttribute("aria-label", hidden.title);
        element.append(hidden);
    }
    return element;
}
async function action(event) {
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled)
        return;
    event.preventDefault();
    event.stopPropagation();
    if (suppressClick && target.dataset.action === "token") {
        suppressClick = false;
        return;
    }
    if (target.dataset.action === "minimize") {
        await game.settings.set(MODULE, "combatBarMinimized", !game.settings.get(MODULE, "combatBarMinimized"));
        return;
    }
    if (target.dataset.action === "settings") {
        openCombatBarSettings();
        return;
    }
    const combat = barCombat();
    if (target.dataset.action === "token") {
        const id = target.closest("[data-entry-id]")?.dataset.entryId ?? "";
        if (event.shiftKey) {
            await navigateBarEntry(id, "pan");
            return;
        }
        const token = barEntries().find(entry => entry.id === id)?.token;
        if (!canvas.ready || !token?.visible)
            return;
        if (token.isOwner) {
            canvas.tokens.activate();
            token.control({ releaseOthers: true });
        }
        return;
    }
    if (target.dataset.action === "mode") {
        if (!game.user?.isGM || modePending)
            return;
        const mode = validMode(target.dataset.mode);
        if (mode === "combat" && !combat)
            return;
        modePending = true;
        refresh();
        try {
            await game.settings.set(MODULE, "combatBarMovement", mode);
        }
        finally {
            modePending = false;
            refresh();
        }
        return;
    }
    if (!combat || turnPending)
        return;
    // A stale click must never advance a different turn or encounter after a rerender is queued.
    if (root?.dataset.turnKey !== `${combat.id}:${combat.round}:${combat.turn}`)
        return;
    if (target.dataset.action === "end-turn" ? !canEndTurn(combat) : !game.user?.isGM)
        return;
    turnPending = true;
    refresh();
    try {
        if (target.dataset.action === "previous-turn")
            await combat.previousTurn();
        else if (target.dataset.action === "end-turn")
            await requestEndTurn(combat);
        else
            await combat.nextTurn();
    }
    finally {
        turnPending = false;
        refresh();
    }
}
function bind(root) {
    root.addEventListener("click", event => { void action(event).catch(report); });
    root.addEventListener("dblclick", event => {
        const target = event.target.closest("[data-action=token]");
        if (!target)
            return;
        event.preventDefault();
        event.stopPropagation();
        cancelHold();
        const id = target.closest("[data-entry-id]")?.dataset.entryId;
        const entry = barEntries().find(entry => entry.id === id);
        const actor = entry?.actor ?? entry?.combatant?.actor ?? entry?.token?.actor;
        // Same sheet-view permission used by Foundry v12's combat tracker.
        if (actor?.testUserPermission(game.user, "OBSERVER")) {
            closeBarFlyout();
            try {
                actor.sheet?.render(true);
            }
            catch (error) {
                report(error);
            }
        }
    });
    root.addEventListener("pointerdown", event => {
        event.stopPropagation();
        cancelHold();
        suppressClick = false;
        const target = event.target.closest("[data-action=token]");
        if (!target || target.disabled || event.button !== 0 || (event.shiftKey && !game.user?.isGM))
            return;
        const pull = event.shiftKey;
        const id = target.closest("[data-entry-id]").dataset.entryId;
        hold = { pointer: event.pointerId, x: event.clientX, y: event.clientY, timer: window.setTimeout(() => {
                hold = undefined;
                suppressClick = true;
                if (game.user?.isGM || game.user?.hasPermission("PING_CANVAS"))
                    void navigateBarEntry(id, pull ? "pull" : "ping").catch(report);
            }, MouseInteractionManager.LONG_PRESS_DURATION_MS) };
    });
    root.addEventListener("pointermove", event => {
        if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) {
            cancelHold();
            suppressClick = true;
        }
    });
    root.addEventListener("pointerover", event => {
        const row = event.target.closest("li[data-entry-id]");
        if (row)
            showBarStatuses(root, row);
    });
    root.addEventListener("pointerleave", () => { cancelHold(); leaveBarFlyout(); });
    root.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        cancelHold();
        const row = event.target.closest("li[data-entry-id]");
        if (row)
            void showBarControls(root, row).catch(report);
    });
    root.addEventListener("dragstart", event => event.preventDefault());
}
function render() {
    frame = 0;
    if (!canvas.ready || !game.settings.get(MODULE, "combatBar")) {
        remove();
        return;
    }
    if (!root) {
        root = document.createElement("nav");
        root.id = "pneuma-combat-bar";
        root.className = "app";
        root.setAttribute("aria-label", "Панель боя");
        bind(root);
        document.body.append(root);
        observer = new ResizeObserver(position);
        observer.observe(root);
    }
    const anchor = document.getElementById("players");
    if (players !== anchor) {
        observer.disconnect();
        observer.observe(root);
        players = anchor;
        if (players)
            observer.observe(players);
        const left = document.getElementById("ui-left");
        if (left)
            observer.observe(left);
    }
    for (const id of ["sidebar", "hotbar", "controls"]) {
        const element = document.getElementById(id);
        if (element)
            observer.observe(element);
    }
    position();
    const combat = barCombat();
    const entries = barEntries(combat);
    const mode = movementMode();
    const endTurn = canEndTurn(combat);
    const size = Number(game.settings.get(MODULE, "combatBarSize"));
    const orientation = game.settings.get(MODULE, "combatBarOrientation");
    const dock = game.settings.get(MODULE, "combatBarDock");
    const minimized = game.settings.get(MODULE, "combatBarMinimized");
    const key = JSON.stringify([size, orientation, dock, minimized, game.settings.get(MODULE, "combatBarNameOnly"), combat?.id, combat?.round, combat?.turn, game.user?.isGM, mode, endTurn, turnPending, modePending,
        entries.map(entry => [entry.id, entry.name, entry.img, entry.active, entry.hidden, entry.defeated, !!entry.token])]);
    if (key === renderKey)
        return;
    renderKey = key;
    cancelHold();
    closeBarFlyout();
    const scroll = root.querySelector("ol")?.scrollTop ?? 0;
    const scrollLeft = root.querySelector("ol")?.scrollLeft ?? 0;
    const turnKey = combat ? `${combat.id}:${combat.round}:${combat.turn}` : "";
    const revealActive = root.dataset.turnKey !== turnKey || root.classList.contains("is-minimized") && !minimized || root.dataset.orientation !== orientation || root.dataset.dock !== dock;
    root.replaceChildren();
    root.dataset.orientation = orientation;
    root.dataset.dock = dock;
    root.classList.toggle("is-minimized", minimized);
    root.classList.toggle("is-gm", !!game.user?.isGM);
    root.style.setProperty("--portrait-size", `${[32, 40, 48, 64, 80, 96].includes(size) ? size : 40}px`);
    root.dataset.turnKey = turnKey;
    root.hidden = !entries.length && !game.user?.isGM;
    const toolbar = document.createElement("div");
    toolbar.className = "pneuma-bar-display";
    const collapse = button(minimized ? "+" : "−", minimized ? "Развернуть панель боя" : "Свернуть панель боя", "minimize");
    collapse.setAttribute("aria-expanded", String(!minimized));
    toolbar.append(collapse);
    const settings = button("", "Настройки панели боя", "settings");
    const gear = document.createElement("i");
    gear.className = "fas fa-cog";
    gear.setAttribute("aria-hidden", "true");
    settings.append(gear);
    toolbar.append(settings);
    root.append(toolbar);
    if (!minimized) {
        if (combat) {
            const header = document.createElement("header");
            if (game.user?.isGM) {
                const previous = button("←", "Предыдущий ход", "previous-turn");
                const next = button("→", "Следующий ход", "next-turn");
                previous.disabled = next.disabled = turnPending;
                header.append(previous, next);
            }
            const round = document.createElement("span");
            round.textContent = `R ${combat.round}`;
            round.title = `Раунд ${combat.round}`;
            if (game.user?.isGM) {
                round.tabIndex = 0;
                round.setAttribute("aria-label", `Раунд ${combat.round}: управление инициативой`);
                round.addEventListener("pointerenter", () => void showBarInitiative(root, round).catch(report));
                round.addEventListener("focus", () => void showBarInitiative(root, round).catch(report));
            }
            header.append(round);
            root.append(header);
        }
        const list = document.createElement("ol");
        list.setAttribute("aria-label", combat ? "Участники боя" : "Персонажи игроков");
        for (const entry of entries)
            list.append(row(entry));
        list.addEventListener("wheel", event => {
            if (root?.dataset.orientation === "horizontal" && list.scrollWidth > list.clientWidth && event.deltaY && !event.ctrlKey) {
                event.preventDefault();
                list.scrollLeft += event.deltaY;
            }
        }, { passive: false });
        list.addEventListener("scroll", () => { positionEndTurn(); closeBarFlyout(); });
        root.append(list);
        list.scrollTop = scroll;
        list.scrollLeft = scrollLeft;
        root.hidden = !entries.length && !game.user?.isGM;
        if (endTurn && entries.some(entry => entry.active)) {
            const end = button("Завершить ход", "Завершить ход", "end-turn");
            end.className = "pneuma-bar-end";
            end.disabled = turnPending;
            root.append(end);
        }
    }
    if (game.user?.isGM) {
        const footer = document.createElement("footer");
        footer.setAttribute("aria-label", "Движение игроков");
        for (const [value, label] of Object.entries(MOVEMENT_MODES)) {
            const control = button("", label, "mode");
            const icon = document.createElement("i");
            icon.className = `fas ${{ default: "fa-person-walking", none: "fa-hand", combat: "fa-hourglass-half", free: "fa-person-running" }[value]}`;
            icon.setAttribute("aria-hidden", "true");
            control.append(icon);
            control.dataset.mode = value;
            control.setAttribute("aria-pressed", String(value === mode));
            control.disabled = modePending || (value === "combat" && !combat);
            footer.append(control);
        }
        root.append(footer);
    }
    position();
    if (revealActive && !minimized) {
        const list = root.querySelector("ol"), active = list?.querySelector("li.active");
        if (list && active) {
            const bounds = list.getBoundingClientRect(), row = active.getBoundingClientRect();
            if (orientation === "horizontal") {
                if (row.left < bounds.left || row.right > bounds.right)
                    list.scrollLeft += row.left - bounds.left - (bounds.width - row.width) / 2;
            }
            else if (row.top < bounds.top || row.bottom > bounds.bottom)
                list.scrollTop += row.top - bounds.top - (bounds.height - row.height) / 2;
        }
    }
    position();
}
function refresh() { if (!frame)
    frame = requestAnimationFrame(render); }
function remove() {
    cancelHold();
    closeBarFlyout();
    observer?.disconnect();
    observer = undefined;
    root?.remove();
    root = undefined;
    players = null;
    renderKey = "";
}
export function registerCombatBar() {
    registerBarMovement(refresh);
    registerBarTurns();
    game.settings.register(MODULE, "combatBar", {
        name: "Показывать панель боя", hint: "Квадратные портреты участников у выбранного края: выбор токена, метка и переход к нему. Правила движения действуют и при скрытой панели.",
        scope: "client", config: true, type: Boolean, default: false, onChange: refresh,
    });
    game.settings.register(MODULE, "combatBarDock", {
        name: "Положение панели боя", hint: "Где показывать панель боя.",
        scope: "client", config: true, type: String, default: "bottom-left", choices: { "bottom-left": "Слева внизу", "top-right": "Справа вверху" },
        onChange: () => { refresh(); Hooks.callAll("pneumaCombatBarDockChanged"); },
    });
    game.settings.register(MODULE, "combatBarSize", {
        name: "Размер портретов панели боя", hint: "Размер квадратных портретов на этом компьютере.",
        scope: "client", config: true, type: String, default: "40",
        choices: { 32: "Маленький (32 px)", 40: "Средний (40 px)", 48: "Большой (48 px)", 64: "Очень большой (64 px)", 80: "Огромный (80 px)", 96: "Максимальный (96 px)" }, onChange: refresh,
    });
    game.settings.register(MODULE, "combatBarOrientation", {
        name: "Раскладка панели боя", hint: "Располагать участников вертикально или горизонтально от выбранного края.",
        scope: "client", config: true, type: String, default: "vertical",
        choices: { vertical: "Вертикально", horizontal: "Горизонтально" }, onChange: refresh,
    });
    game.settings.register(MODULE, "combatBarMinimized", {
        name: "Панель боя свёрнута", scope: "client", config: false, type: Boolean, default: false, onChange: refresh,
    });
    game.settings.register(MODULE, "combatBarNameOnly", {
        name: "Скрыть подсказки управления на панели боя", hint: "В подсказках к портретам панели боя показывать только имя, без инструкций по щелчкам.",
        scope: "client", config: true, type: Boolean, default: false, onChange: refresh,
    });
    // Keep portrait nodes stable between the two clicks; a selection rerender would swallow dblclick.
    Hooks.on("controlToken", () => {
        const entries = barEntries();
        root?.querySelectorAll("li[data-entry-id]").forEach(row => {
            row.classList.toggle("controlled", !!entries.find(entry => entry.id === row.dataset.entryId)?.token?.controlled);
        });
    });
    for (const hook of ["ready", "canvasReady", "renderPlayerList", "renderSceneNavigation", "renderSceneControls", "collapseSidebar", "renderSidebar", "renderCombatTracker", "createToken", "deleteToken",
        "updateActor", "updateUser", "userConnected", "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"])
        Hooks.on(hook, refresh);
    const visibility = new WeakMap();
    Hooks.on("refreshToken", (token) => {
        const before = visibility.get(token);
        visibility.set(token, token.isVisible);
        if (before !== token.isVisible)
            refresh();
    });
    Hooks.on("updateToken", (_token, changes) => {
        if (!tokenPositionOnly(changes))
            refresh();
    });
    Hooks.on("canvasTearDown", () => { cancelAnimationFrame(frame); frame = 0; remove(); });
    Hooks.on("renderHotbar", refresh);
    window.addEventListener("resize", position);
    window.addEventListener("pointerup", cancelHold);
    window.addEventListener("pointercancel", cancelHold);
    window.addEventListener("blur", cancelHold);
    window.addEventListener("pointerdown", event => { if (root && !root.contains(event.target)) {
        closeBarFlyout();
    } });
    window.addEventListener("keydown", event => { if (event.key === "Escape")
        closeBarFlyout(); });
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
        Hooks.on(hook, invalidateBarStatuses);
}
