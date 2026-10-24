#!/usr/bin/env python3
"""Build a dependency-free Foundry package from explicit source files."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
MODULE = ROOT / 'foundry' / 'redline-combat'
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'dist'
manifest = json.loads((MODULE / 'module.json').read_text(encoding='utf-8'))
assert manifest['id'] == 'redline-combat'
assert manifest['download'].endswith(f"/v{manifest['version']}/redline-combat.zip")

# Package only the production HUD. Historical prototype sources stay in the repository.
paths = ['module.json', 'README.md', 'QA.md', 'scripts/main.js', 'scripts/state.js', 'scripts/view.js', 'scripts/presentation.js', 'scripts/skills.js', 'scripts/preferences.js', 'scripts/motion.js', 'scripts/actions.js', 'scripts/capabilities.js', 'scripts/encounter.js', 'styles/redline.css', 'styles/host.css', 'templates/hud.hbs', 'assets/redline-signature.png']
# Embedded combat tools: compiled output and assets built by `npm run build:combat`.
paths += sorted(str(path.relative_to(MODULE)).replace('\\', '/') for path in (MODULE / 'combat').rglob('*') if path.is_file())
paths.append('styles/combat-theme.css')
for name in paths:
    assert (MODULE / name).is_file(), name
for name in manifest['esmodules'] + manifest['styles']:
    assert name in paths, name
OUT.mkdir(parents=True, exist_ok=True)
shutil.copyfile(MODULE / 'module.json', OUT / 'module.json')
archive = OUT / 'redline-combat.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for name in paths:
        # A single module directory works both for Foundry installation and manual extraction.
        info = zipfile.ZipInfo('redline-combat/' + name, date_time=(2026, 10, 11, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        package.writestr(info, (MODULE / name).read_bytes())
    assert package.testzip() is None
checksums = {name: hashlib.sha256((OUT / name).read_bytes()).hexdigest() for name in ['module.json', 'redline-combat.zip']}
(OUT / 'SHA256SUMS.txt').write_text(''.join(f'{value}  {name}\n' for name, value in checksums.items()), encoding='utf-8', newline='\n')
print(json.dumps({'version': manifest['version'], 'files': len(paths), 'zip_bytes': archive.stat().st_size, 'sha256': checksums}, indent=2))
