#!/usr/bin/env python3
"""Verify a built REDLINE package and, optionally, its public release bytes."""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'foundry' / 'redline-combat'
VERSION_FILES = [
    'package.json', 'foundry/redline-combat/package.json',
    'foundry/redline-combat/module.json', 'distribution/module.json',
]
RELATIVE_IMPORT = re.compile(r'''\b(?:from\s*|import\s*\(\s*|import\s*)(['"])(\.\.?/[^'"]+)\1''')
CSS_URL = re.compile(r'''url\(\s*(['"]?)([^)'"\s]+)\1\s*\)''', re.IGNORECASE)


class VerificationError(Exception):
    """A failed, user-readable release invariant."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def package_paths() -> list[str]:
    """Read the builder's explicit literal allowlist without running the builder."""
    tree = ast.parse((ROOT / 'build-module.py').read_text(encoding='utf-8'))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'paths' for target in node.targets):
            paths = ast.literal_eval(node.value)
            require(isinstance(paths, list) and all(isinstance(path, str) for path in paths), 'Builder paths must be a literal list of strings.')
            require(bool(paths) and len(set(paths)) == len(paths), 'Builder paths must be nonempty and unique.')
            return paths
    raise VerificationError('Could not find the explicit package paths in build-module.py.')


def included_path(parent: Path, reference: str, allowed: set[str]) -> str:
    parsed = urllib.parse.urlsplit(reference)
    path = (parent / urllib.parse.unquote(parsed.path)).resolve()
    require(path.is_relative_to(MODULE.resolve()), f'Package reference escapes module: {reference}')
    relative = path.relative_to(MODULE.resolve()).as_posix()
    require(relative in allowed and path.is_file(), f'Package reference is missing or excluded: {relative}')
    return relative


class PublicReader:
    """Bound retries across the entire remote verification to thirty seconds."""

    def __init__(self) -> None:
        self.deadline = time.monotonic() + 30

    def get(self, url: str) -> bytes:
        require(urllib.parse.urlsplit(url).scheme == 'https', 'Remote verification requires HTTPS URLs.')
        last_error = 'Remote deadline exceeded.'
        for attempt in range(4):
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                break
            request = urllib.request.Request(url, headers={
                'User-Agent':'REDLINE-release-verifier/1.0', 'Cache-Control':'no-cache',
            })
            try:
                with urllib.request.urlopen(request, timeout=min(8, remaining)) as response:
                    content = response.read()
                require(time.monotonic() <= self.deadline, 'Remote verification exceeded its thirty-second budget.')
                return content
            except urllib.error.HTTPError as error:
                last_error = f'HTTP {error.code} while fetching {url}'
                if error.code not in {404, 408, 429, 500, 502, 503, 504}:
                    break
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last_error = f'{type(error).__name__} while fetching {url}'
            remaining = self.deadline - time.monotonic()
            if attempt < 3 and remaining > 0:
                time.sleep(min(2 ** attempt, remaining))
        raise VerificationError(last_error)


def verify(dist: Path, remote: bool) -> dict:
    checks = []
    documents = [json.loads((ROOT / name).read_text(encoding='utf-8')) for name in VERSION_FILES]
    versions = [document.get('version') for document in documents]
    version = versions[0]
    require(isinstance(version, str) and bool(version) and all(value == version for value in versions), 'The four package/manifest versions do not match.')
    manifest = documents[2]
    require(manifest.get('id') == 'redline-combat', 'Unexpected module identifier.')
    module_bytes = (MODULE / 'module.json').read_bytes()
    distribution_bytes = (ROOT / 'distribution/module.json').read_bytes()
    require(distribution_bytes == module_bytes, 'distribution/module.json differs from the production manifest.')
    require((dist / 'module.json').read_bytes() == module_bytes, 'Built module.json differs from the production manifest.')
    checks.append('matching_versions_and_manifest_bytes')

    paths = package_paths()
    allowed = set(paths)
    for name in paths:
        require(not Path(name).is_absolute() and '..' not in Path(name).parts, f'Unsafe builder path: {name}')
        require((MODULE / name).is_file(), f'Package source missing: {name}')
    for name in manifest.get('esmodules', []) + manifest.get('styles', []):
        require(name in allowed, f'Manifest entry is absent from the package allowlist: {name}')
    archive_bytes = (dist / 'redline-combat.zip').read_bytes()
    with zipfile.ZipFile(dist / 'redline-combat.zip') as archive:
        expected = {'redline-combat/' + name for name in paths}
        require(len(archive.namelist()) == len(expected) and set(archive.namelist()) == expected, 'ZIP entries differ from the explicit production allowlist.')
        require(archive.testzip() is None, 'ZIP integrity check failed.')
        for name in paths:
            require(archive.read('redline-combat/' + name) == (MODULE / name).read_bytes(), f'ZIP source mismatch: {name}')
    checks.append('zip_integrity_and_source_identical_allowlist')

    imports = assets = 0
    for name in paths:
        source = MODULE / name
        if name.endswith('.js'):
            for match in RELATIVE_IMPORT.finditer(source.read_text(encoding='utf-8')):
                included_path(source.parent, match.group(2), allowed)
                imports += 1
        elif name.endswith('.css'):
            for match in CSS_URL.finditer(source.read_text(encoding='utf-8')):
                reference = match.group(2)
                if urllib.parse.urlsplit(reference).scheme or reference.startswith(('#', '//')):
                    continue
                included_path(source.parent, reference, allowed)
                assets += 1
    checks.append('packaged_relative_javascript_imports_and_css_assets')

    checksum_bytes = (dist / 'SHA256SUMS.txt').read_bytes()
    sums = {}
    for line in checksum_bytes.decode('utf-8').splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64}) [ *]([^\r\n]+)', line)
        require(match is not None, 'Malformed SHA256SUMS.txt line.')
        name = match.group(2)
        require(name not in sums, f'Duplicate checksum entry: {name}')
        sums[name] = match.group(1).lower()
    require({'module.json','redline-combat.zip'}.issubset(sums), 'SHA256SUMS.txt must include the manifest and module ZIP.')
    local_bytes = {}
    for name in sums:
        require(Path(name).name == name and name not in {'.','..','SHA256SUMS.txt'}, f'Unsafe release asset name: {name}')
        local_bytes[name] = (dist / name).read_bytes()
    for name, content in local_bytes.items():
        require(sums[name] == digest(content), f'SHA256SUMS.txt mismatch: {name}')
    checks.append('local_sha256sums')

    remote_checks = []
    if remote:
        repository_url = urllib.parse.urlsplit(manifest.get('url', ''))
        parts = repository_url.path.strip('/').removesuffix('.git').split('/')
        require(repository_url.scheme == 'https' and repository_url.hostname == 'github.com' and len(parts) == 2 and all(parts), 'Expected a public GitHub repository URL in the manifest.')
        repository = '/'.join(parts)
        release_base = f'https://github.com/{repository}/releases/download/v{version}'
        prerelease = '-' in version.partition('+')[0]
        stable_manifest = f'https://raw.githubusercontent.com/{repository}/main/distribution/module.json'
        expected_manifest = release_base + '/module.json' if prerelease else stable_manifest
        require(manifest.get('manifest') == expected_manifest,
            'Prereleases must use a version-pinned manifest; stable releases must use the existing main/distribution/module.json update channel.')
        require(manifest.get('download') == release_base + '/redline-combat.zip', 'Release ZIP URL must be pinned to this version.')
        targets = [(release_base + '/' + urllib.parse.quote(name), content,
            'public_release_manifest' if name == 'module.json' else
            'public_release_zip' if name == 'redline-combat.zip' else 'public_asset:' + name)
            for name,content in local_bytes.items()] + [
            (release_base + '/SHA256SUMS.txt', checksum_bytes, 'public_release_checksums'),
            (f'https://raw.githubusercontent.com/{repository}/v{version}/distribution/module.json', distribution_bytes, 'raw_tag_distribution_manifest'),
        ]
        if not prerelease:
            targets.append((stable_manifest,distribution_bytes,'stable_update_manifest'))
        reader = PublicReader()
        for url, expected, label in targets:
            require(reader.get(url) == expected, f'Remote bytes differ from the local build: {label}')
            remote_checks.append(label)
    return {
        'status':'passed', 'version':version, 'files':len(paths), 'sourceIdenticalFiles':len(paths),
        'relativeImports':imports, 'cssAssets':assets, 'zipBytes':len(archive_bytes),
        'sha256':sums, 'checks':checks, 'remote':remote,
        'remoteChecks':remote_checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist', help='Built release directory (default: repository dist/).')
    parser.add_argument('--remote', action='store_true', help='Compare public release assets and the tag manifest byte for byte.')
    parser.add_argument('--report', type=Path, help='Optional JSON report destination.')
    arguments = parser.parse_args()
    try:
        report = verify(arguments.dist.resolve(), arguments.remote)
    except (VerificationError, OSError, ValueError, SyntaxError, zipfile.BadZipFile) as error:
        report = {'status':'failed', 'remote':arguments.remote, 'error':str(error)}
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if arguments.report:
        arguments.report.parent.mkdir(parents=True, exist_ok=True)
        arguments.report.write_text(encoded, encoding='utf-8', newline='\n')
    print(encoded, end='')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
