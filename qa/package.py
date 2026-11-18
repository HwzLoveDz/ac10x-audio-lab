
"""Package the current web app, shared firmware sources, and both app images."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def release_files(version: str) -> list[Path]:
    # Include source changes and new target files while excluding local build/evidence directories.
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT, check=True, stdout=subprocess.PIPE,
    )
    allowed_roots = {"docs", "firmware", "qa"}
    files = []
    for name in sorted(set(result.stdout.decode().rstrip("\0").split("\0"))):
        path = Path(name)
        if not (ROOT / path).is_file() or path.name.startswith("."):
            continue
        if len(path.parts) > 1 and path.parts[0] not in allowed_roots:
            continue
        if path.parts[:2] == ("docs", "s3-results"):
            continue
        if path.name.startswith("AC10x-Audio-Lab-v") and path.name != f"AC10x-Audio-Lab-v{version}.html":
            continue
        files.append(path)
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, help="Passing JSON from qa/run.cjs")
    parser.add_argument("output", type=Path, help="New ZIP file")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    if report["status"] != "PASSED" or report["checks"] < 1 or any(
        suite["exitCode"] != 0 or suite["error"] for suite in report["suites"]
    ):
        raise ValueError("A complete passing regression report is required")
    for name, expected in report["sourceHashes"].items():
        if digest((ROOT / name).read_bytes()) != expected:
            raise ValueError(f"Tested source changed: {name}")

    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    profile = json.loads((ROOT / "DEFAULT-FIRMWARE.json").read_text(encoding="utf-8"))
    firmware = profile["firmwareVersion"]
    entry = f"AC10x-Audio-Lab-v{version}.html"
    if profile["webVersion"] != version:
        raise ValueError("Default configuration metadata is for another web version")
    if digest((ROOT / entry).read_bytes()) != report["sourceHashes"]["AC10x-Audio-Lab.html"]:
        raise ValueError("Versioned HTML differs from the tested bundle")

    image_hashes = dict(line.split()[::-1] for line in (ROOT / "firmware/SHA256SUMS.txt")
                        .read_text(encoding="utf-8").splitlines() if line.strip())
    expected_images = {f"images/AC10x-{target}-{firmware}-app.bin" for target in profile["targets"]}
    if set(image_hashes) != expected_images:
        raise ValueError("Firmware checksums must cover every release target exactly once")
    for name, expected in image_hashes.items():
        if digest((ROOT / "firmware" / name).read_bytes()) != expected:
            raise ValueError(f"Firmware checksum mismatch: {name}")

    files = release_files(version)
    required = {entry, "firmware/source/CMakeLists.txt",
                *(f"firmware/{name}" for name in expected_images)}
    if not required.issubset({path.as_posix() for path in files}):
        raise ValueError("The selected release files are incomplete")

    hashes = {}
    with ZipFile(args.output, "x", ZIP_DEFLATED) as archive:
        for path in files:
            data = (ROOT / path).read_bytes()
            name = path.as_posix()
            archive.writestr(name, data)
            hashes[name] = digest(data)
        archive.writestr("MANIFEST.sha256", "".join(
            f"{checksum}  {name}\n" for name, checksum in sorted(hashes.items())
        ))
    with ZipFile(args.output) as archive:
        if archive.testzip() is not None or any(
            digest(archive.read(name)) != expected for name, expected in hashes.items()
        ):
            raise ValueError("Archive verification failed")
    print(f"{args.output.name}: {len(hashes)} files; SHA-256 {digest(args.output.read_bytes())}")


if __name__ == "__main__":
    main()
