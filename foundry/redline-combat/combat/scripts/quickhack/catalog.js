export const QUICKHACKS = Object.freeze([
    { id: "impair-movement", name: "Блокировка движения", tier: "Простой", dv: 6 },
    { id: "sonic-shock", name: "Звуковой удар", tier: "Простой", dv: 6 },
    { id: "overheat", name: "Перегрев", tier: "Стандартный", dv: 8, automaticDamageFormula: "4" },
    { id: "short-circuit", name: "Короткое замыкание", tier: "Стандартный", dv: 8 },
    { id: "cyberware-malfunction", name: "Сбой киберимпланта", tier: "Сложный", dv: 10 },
    { id: "lure", name: "Приманка", tier: "Сложный", dv: 10, silentOnSuccess: true },
    { id: "slow", name: "Замедление", tier: "Сложный", dv: 10 },
    { id: "synapse-burnout", name: "Выжигание синапсов", tier: "Сложный", dv: 10, damageFormula: "3d6" },
    { id: "puppet", name: "Марионетка", tier: "Продвинутый", dv: 12 },
    { id: "shard-ejection", name: "Извлечение щепки", tier: "Продвинутый", dv: 12 },
    { id: "system-reset", name: "Перезагрузка системы", tier: "Продвинутый", dv: 12 }
]);
export const getQuickhack = (id) => QUICKHACKS.find(hack => hack.id === id);
