// A caching proxy or browser cache can keep serving the previous release's files after the module is updated.
// Foundry's world data is always fresh, so the installed version tells this client whether the loaded code is current.
// If it is not, refetch every client file past the cache (what Ctrl+F5 does) and reload once.
// No static imports: this file must run even when its stale neighbours no longer link.
const MODULE_ID = 'redline-combat';
const ATTEMPT_KEY = `${MODULE_ID}.freshness-attempt`;

export const CLIENT_FILES = Object.freeze([
  'scripts/guard.js', 'scripts/main.js', 'scripts/state.js', 'scripts/view.js', 'scripts/presentation.js',
  'scripts/skills.js', 'scripts/preferences.js', 'scripts/motion.js', 'scripts/actions.js',
  'scripts/capabilities.js', 'scripts/encounter.js',
  'styles/redline.css', 'styles/host.css',
  'templates/hud.hbs',
]);

/** 'current' — nothing to do; 'refresh' — refetch and reload; 'stuck' — this tab already tried for this release. */
export function freshnessVerdict({loadedVersion, installedVersion, attemptedVersion}) {
  if (!installedVersion || loadedVersion === installedVersion) return 'current';
  return attemptedVersion === installedVersion ? 'stuck' : 'refresh';
}

export async function refreshClientFiles(moduleRoot, fetcher = fetch) {
  await Promise.all(CLIENT_FILES.map(file =>
    Promise.resolve().then(() => fetcher(new URL(file, moduleRoot), {cache:'reload'})).catch(() => null)));
}

function session(action) {
  try { return action(globalThis.sessionStorage); } catch { return null; }
}

async function ensureFreshCode() {
  const installedVersion = game.modules.get(MODULE_ID)?.version;
  // The page has already evaluated main.js; this returns that same instance, or rejects if it failed to load.
  const loadedVersion = await import('./main.js').then(main => main.CODE_VERSION, () => undefined);
  const attemptedVersion = session(storage => storage.getItem(ATTEMPT_KEY));
  const verdict = freshnessVerdict({loadedVersion, installedVersion, attemptedVersion});
  if (verdict === 'current') return void session(storage => storage.removeItem(ATTEMPT_KEY));
  if (verdict === 'stuck') {
    Hooks.once('ready', () => ui.notifications.warn(
      `REDLINE COMBAT: браузер получил старые файлы модуля вместо версии ${installedVersion}. `
      + 'Обновите страницу с очисткой кэша (Ctrl+F5); если не поможет — сообщите ведущему.', {permanent:true}));
    return;
  }
  session(storage => storage.setItem(ATTEMPT_KEY, installedVersion));
  console.info(`REDLINE COMBAT | Загружен код ${loadedVersion ?? 'неизвестной версии'} вместо ${installedVersion}: обновляю файлы и перезагружаю страницу.`);
  await refreshClientFiles(new URL('../', import.meta.url));
  globalThis.location.reload();
}

if (typeof Hooks !== 'undefined') Hooks.once('init', () => { void ensureFreshCode(); });
