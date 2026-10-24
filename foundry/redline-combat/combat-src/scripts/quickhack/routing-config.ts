// Routing retained from PneumaQuickHack.
export interface Scenario { sourceIsPlayer: boolean; targetIsPlayer: boolean }
export interface RoutingConfig { npcToPlayerJackInAudience: string; npcToPlayerJackInShowTotals: boolean; npcToPlayerJackInRevealAttacker: boolean; npcToPlayerQuickhackAudience: string; npcToPlayerQuickhackRevealAttacker: boolean; playerToNpcJackInAudience: string }
export const AUDIENCE = Object.freeze({
  GM: "gm",
  PUBLIC: "public",
  SOURCE_OWNERS: "sourceOwners",
  TARGET_OWNERS: "targetOwners"
});

export const SCENARIO = Object.freeze({
  NPC_TO_NPC: "npcToNpc",
  NPC_TO_PC: "npcToPc",
  PC_TO_NPC: "pcToNpc",
  PC_TO_PC: "pcToPc"
});

export const DEFAULT_ROUTING_CONFIG = Object.freeze({
  npcToPlayerJackInAudience: AUDIENCE.TARGET_OWNERS,
  npcToPlayerJackInShowTotals: false,
  npcToPlayerJackInRevealAttacker: false,
  npcToPlayerQuickhackAudience: AUDIENCE.PUBLIC,
  npcToPlayerQuickhackRevealAttacker: false,
  playerToNpcJackInAudience: AUDIENCE.SOURCE_OWNERS
});

function normalizedBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizedPlayerAudience(value: unknown, fallback: string) {
  return [AUDIENCE.TARGET_OWNERS, AUDIENCE.PUBLIC].some(choice => choice === value) ? String(value) : fallback;
}

function normalizedAttackerAudience(value: unknown, fallback: string) {
  return [AUDIENCE.SOURCE_OWNERS, AUDIENCE.PUBLIC, AUDIENCE.GM].some(choice => choice === value) ? String(value) : fallback;
}

export function normalizeRoutingConfig(config: Partial<RoutingConfig> = {}) {
  return {
    npcToPlayerJackInAudience: normalizedPlayerAudience(
      config.npcToPlayerJackInAudience,
      DEFAULT_ROUTING_CONFIG.npcToPlayerJackInAudience
    ),
    npcToPlayerJackInShowTotals: normalizedBoolean(
      config.npcToPlayerJackInShowTotals,
      DEFAULT_ROUTING_CONFIG.npcToPlayerJackInShowTotals
    ),
    npcToPlayerJackInRevealAttacker: normalizedBoolean(
      config.npcToPlayerJackInRevealAttacker,
      DEFAULT_ROUTING_CONFIG.npcToPlayerJackInRevealAttacker
    ),
    npcToPlayerQuickhackAudience: normalizedPlayerAudience(
      config.npcToPlayerQuickhackAudience,
      DEFAULT_ROUTING_CONFIG.npcToPlayerQuickhackAudience
    ),
    npcToPlayerQuickhackRevealAttacker: normalizedBoolean(
      config.npcToPlayerQuickhackRevealAttacker,
      DEFAULT_ROUTING_CONFIG.npcToPlayerQuickhackRevealAttacker
    ),
    playerToNpcJackInAudience: normalizedAttackerAudience(
      config.playerToNpcJackInAudience,
      DEFAULT_ROUTING_CONFIG.playerToNpcJackInAudience
    )
  };
}

export function scenarioFor({ sourceIsPlayer, targetIsPlayer }: Scenario) {
  if (sourceIsPlayer && targetIsPlayer) return SCENARIO.PC_TO_PC;
  if (sourceIsPlayer) return SCENARIO.PC_TO_NPC;
  if (targetIsPlayer) return SCENARIO.NPC_TO_PC;
  return SCENARIO.NPC_TO_NPC;
}

export function resolveJackInRouting(config: Partial<RoutingConfig>, { sourceIsPlayer, targetIsPlayer, targetAware }: Scenario & { targetAware: boolean }) {
  const normalized = normalizeRoutingConfig(config);
  const scenario = scenarioFor({ sourceIsPlayer, targetIsPlayer });

  if (scenario === SCENARIO.NPC_TO_PC && targetAware) {
    return {
      audience: normalized.npcToPlayerJackInAudience,
      revealAttacker: normalized.npcToPlayerJackInRevealAttacker,
      showTotals: normalized.npcToPlayerJackInShowTotals,
      showAwareness: true
    };
  }
  if (scenario === SCENARIO.PC_TO_NPC) {
    return {
      audience: normalized.playerToNpcJackInAudience,
      revealAttacker: true,
      showTotals: true,
      showAwareness: true
    };
  }
  if (scenario === SCENARIO.PC_TO_PC) {
    return {
      audience: AUDIENCE.PUBLIC,
      revealAttacker: true,
      showTotals: true,
      showAwareness: true
    };
  }
  return {
    audience: AUDIENCE.GM,
    revealAttacker: true,
    showTotals: true,
    showAwareness: true
  };
}

export function resolveQuickhackRouting(config: Partial<RoutingConfig>, { sourceIsPlayer, targetIsPlayer }: Scenario) {
  const normalized = normalizeRoutingConfig(config);
  const scenario = scenarioFor({ sourceIsPlayer, targetIsPlayer });

  if (scenario === SCENARIO.NPC_TO_PC) {
    return {
      audience: normalized.npcToPlayerQuickhackAudience,
      revealAttacker: normalized.npcToPlayerQuickhackRevealAttacker,
      showInterfaceTotal: true,
      showAwareness: true
    };
  }
  if (scenario === SCENARIO.NPC_TO_NPC) {
    return {
      audience: AUDIENCE.GM,
      revealAttacker: true,
      showInterfaceTotal: false,
      showAwareness: true
    };
  }
  return {
    audience: AUDIENCE.PUBLIC,
    revealAttacker: true,
    showInterfaceTotal: false,
    showAwareness: true
  };
}
