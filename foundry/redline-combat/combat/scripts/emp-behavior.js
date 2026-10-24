export const EMP_METHODS = { manual: "Мастер выбирает 2", random: "Случайно" };
export function normalizeEmpBehavior(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const legacy = (side) => input[side];
    const randomMethods = ["random", "equal", "foundation-more", "foundation-less", "no-foundation"];
    const profile = (side) => {
        const p = legacy(side), method = p?.method;
        return { method: side === "player" && method === "shortlist" ? "shortlist" : randomMethods.includes(method ?? "") ? "random" : "manual",
            skipAffected: typeof p?.skipAffected === "boolean" ? p.skipAffected : true };
    };
    // Shared eligibility replaces per-side draws. Prefer GM's configured random draw, then player's.
    const draws = ["gm", "player"].map(side => { const p = legacy(side); return p?.method === "shortlist" ? p.shortlistMethod : p?.method; });
    const draw = draws.find(v => randomMethods.includes(v ?? ""));
    return { gm: profile("gm"), player: profile("player"),
        includeFashionware: typeof input.includeFashionware === "boolean" ? input.includeFashionware : !draw,
        includeBioware: typeof input.includeBioware === "boolean" ? input.includeBioware : input.excludeBioware !== true,
        includeFoundational: typeof input.includeFoundational === "boolean" ? input.includeFoundational : draw !== "no-foundation",
        foundationWeight: ["equal", "foundation-more", "foundation-less"].includes(input.foundationWeight ?? "") ? input.foundationWeight : draw === "foundation-more" || draw === "foundation-less" ? draw : "equal",
        frameReduceMove: input.frameReduceMove === true, frameMoveReduction: Number.isFinite(Number(input.frameMoveReduction)) ? Math.abs(Number(input.frameMoveReduction)) : 2, frameNoMove: input.frameNoMove === true, frameActionPenalty: input.frameActionPenalty === true, framePenalty: Number.isFinite(Number(input.framePenalty)) ? Math.abs(Number(input.framePenalty)) : 2, hardened: input.hardened === "consume" ? "consume" : "exclude" };
}
export const empBehavior = () => normalizeEmpBehavior(game.settings.get("redline-combat", "empBehavior"));
export function applyEmpBehavior(options, settings) {
    const profile = settings[options.chooser === "player" ? "player" : "gm"];
    return { ...options, method: options.chooser === "random" ? "random" : profile.method, mode: settings.foundationWeight,
        policy: { ...options.policy, excludeFashionware: !settings.includeFashionware, excludeBioware: !settings.includeBioware,
            foundational: options.policy.foundational && settings.includeFoundational, skipAffected: profile.skipAffected,
            frameMoveReduction: settings.frameReduceMove ? settings.frameMoveReduction : 0, frameNoMove: settings.frameNoMove, framePenalty: settings.frameActionPenalty ? settings.framePenalty : 0, hardened: settings.hardened } };
}
