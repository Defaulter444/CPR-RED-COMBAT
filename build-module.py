#!/usr/bin/env python3
"""Build a dependency-free Foundry package from explicit source files."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
MODULE = ROOT / 'foundry' / 'redline-combat'
OUT = ROOT / 'dist'
manifest = json.loads((MODULE / 'module.json').read_text(encoding='utf-8'))
assert manifest['id'] == 'redline-combat'
assert manifest['download'].endswith(f"/v{manifest['version']}/redline-combat.zip")

# Package only the production HUD. Historical prototype sources stay in the repository.
paths = ['module.json', 'README.md', 'QA.md', 'scripts/main.js', 'scripts/state.js', 'scripts/view.js', 'scripts/actions.js', 'scripts/capabilities.js', 'styles/redline.css', 'styles/host.css', 'templates/hud.hbs']
for name in paths:
    assert (MODULE / name).is_file(), name
for name in manifest['esmodules'] + manifest['styles']:
    assert name in paths, name
OUT.mkdir(exist_ok=True)
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
(OUT / 'SHA256SUMS.txt').write_text(''.join(f'{value}  {name}\n' for name, value in checksums.items()))
print(json.dumps({'version': manifest['version'], 'files': len(paths), 'zip_bytes': archive.stat().st_size, 'sha256': checksums}, indent=2))
