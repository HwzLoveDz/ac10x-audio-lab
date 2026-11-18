"""Verify a ZIP and its complete checksum manifest without extracting or flashing."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('--sha256', help='Expected SHA-256; otherwise use a sidecar or adjacent SHA256SUMS.txt')
args = parser.parse_args()
archive = args.archive
expected = args.sha256
if expected is None:
    sidecar = archive.with_suffix(archive.suffix+'.sha256')
    if sidecar.is_file():
        expected = sidecar.read_text(encoding='utf-8-sig').split()[0]
    else:
        manifest = archive.parent/'SHA256SUMS.txt'
        matches = [line.split('  ', 1)[0] for line in manifest.read_text(encoding='utf-8-sig').splitlines()
                   if '  ' in line and line.split('  ', 1)[1] == archive.name]
        assert len(matches) == 1, 'Expected exactly one checksum for this archive'
        expected = matches[0]
assert re.fullmatch(r'[0-9a-fA-F]{64}', expected), 'Invalid expected SHA-256'
expected = expected.lower()
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names = [n for n in z.namelist() if not n.endswith('/')]
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    for name in names:
        assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
        assert '\\' not in name and not re.match(r'^[a-zA-Z]:', name), 'Unsafe archive path'
    if 'SHA256SUMS.txt' in names:
        manifest_name, prefix = 'SHA256SUMS.txt', ''
    else:
        manifests = [n for n in names if n.endswith('/SHA256SUMS.txt')]
        assert len(manifests) == 1, 'Cannot select the package checksum manifest'
        manifest_name = manifests[0]
        prefix = manifest_name.rsplit('/', 1)[0]+'/'
    verified = set()
    for line in z.read(manifest_name).decode('utf-8-sig').splitlines():
        digest, relative = line.split('  ',1)
        assert re.fullmatch(r'[0-9a-fA-F]{64}', digest), 'Invalid inner checksum'
        assert not PurePosixPath(relative).is_absolute() and '..' not in PurePosixPath(relative).parts
        name = prefix+relative
        assert name != manifest_name and name not in verified, 'Duplicate/self-referencing checksum'
        assert hashlib.sha256(z.read(name)).hexdigest() == digest.lower(), relative
        verified.add(name)
    assert verified | {manifest_name} == set(names), 'Unlisted payload in archive'
print('PASS ZIP SHA256, CRC and', len(verified), 'inner file hashes; no extraction/device access')
