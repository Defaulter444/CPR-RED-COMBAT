import { primaryGM as gm } from "./shared.js";
import { requireCombatSocket } from "./socket-health.js";
const channel = "module.redline-combat";
const pending = new Map();
let queue = Promise.resolve();
/** Recheck the exact turn inside the GM queue so two requests cannot skip a participant. */
export async function advanceBarTurn(request) {
    const combat = game.combats?.get(request.combat), user = game.users?.get(request.user);
    if (!game.user?.isGM || !combat?.active || !combat.started || !user?.active)
        throw Error("Бой или игрок, отправивший запрос, уже неактивны.");
    if (combat.round !== request.round || combat.turn !== request.turn || combat.combatant?.id !== request.combatant)
        throw Error("Ход уже сменился.");
    if (!user.isGM && !combat.combatant.actor?.testUserPermission(user, "OWNER"))
        throw Error("Завершить этот ход может только владелец текущего персонажа.");
    await combat.nextTurn();
}
export async function requestEndTurn(combat) {
    const request = { barTurn: "request", id: foundry.utils.randomID(), user: game.user.id, combat: combat.id, round: combat.round, turn: combat.turn, combatant: combat.combatant.id };
    if (game.user?.isGM)
        return advanceBarTurn(request);
    requireCombatSocket();
    const authority = gm();
    if (!authority)
        throw Error("Чтобы завершить ход, нужен активный Мастер.");
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(request.id); reject(Error("Мастер не ответил вовремя. Проверьте текущий ход, прежде чем повторять.")); }, 15000);
        pending.set(request.id, { gm: authority.id, resolve, reject, timer });
        game.socket.emit(channel, request);
    });
}
export function registerBarTurns() {
    Hooks.once("ready", () => {
        game.socket.on(channel, (packet) => {
            if (!packet || !["request", "result"].includes(packet.barTurn))
                return;
            if (packet.barTurn === "result") {
                const wait = pending.get(packet.id);
                if (!wait || packet.user !== game.user?.id || packet.gm !== wait.gm)
                    return;
                clearTimeout(wait.timer);
                pending.delete(packet.id);
                if (packet.error)
                    wait.reject(Error(packet.error));
                else
                    wait.resolve();
                return;
            }
            if (gm()?.id !== game.user?.id)
                return;
            const request = packet;
            const run = queue.catch(() => { }).then(() => advanceBarTurn(request));
            queue = run;
            const reply = (error) => game.socket.emit(channel, { barTurn: "result", id: request.id, user: request.user, gm: game.user.id, error });
            void run.then(() => reply(), error => reply(String(error)));
        });
    });
}
