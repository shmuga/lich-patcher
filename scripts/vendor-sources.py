"""Package pinned upstream source checkouts for redistribution.

Usage: python3 scripts/vendor-sources.py /path/to/extracted/github/archives
The directory must contain the five NAME-COMMIT directories listed below.
Download URLs and checksums are recorded in public/source/upstreams.json.
This is a maintainer task, not part of an ordinary website build.
"""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(sys.argv[1])
OUT = ROOT / "public/source"
OUT.mkdir(parents=True, exist_ok=True)
REVISIONS = {
    "libpd-wasm": ("hyrfilm/libpd-wasm", "5336aeff897fde33e48af23432924a450f61fda6"),
    "pure-data": ("pure-data/pure-data", "b1ff370c87b579f80130a9cafbf27cd890e90882"),
    "pd-cyclone": ("porres/pd-cyclone", "d2cff143021c8b1a1f3cd5c71cdb32c5576ba85a"),
    "pd-else": ("porres/pd-else", "bd3fbb5a688276dcf650de8bb6a18ec0fd6017b0"),
    "hvcc": ("Wasted-Audio/hvcc", "de4b13fa0e9daec14fe0414ac1bce28370298b4a"),
}
DIRS = {name: CACHE / f"{name}-{rev}" for name, (_, rev) in REVISIONS.items()}
for directory in DIRS.values():
    if not directory.is_dir():
        raise SystemExit(f"Missing source checkout: {directory}")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def archive(name, files):
    # Fixed metadata makes the source archive reproducible from these inputs.
    with (OUT / name).open("wb") as target:
        with gzip.GzipFile(fileobj=target, mode="wb", filename="", mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w") as tar:
                for dest, (data, mode) in sorted(files.items()):
                    info = tarfile.TarInfo(dest)
                    info.size, info.mode, info.mtime = len(data), mode, 0
                    tar.addfile(info, io.BytesIO(data))
    return sha((OUT / name).read_bytes())


def collect(root, prefix, accept):
    return {
        prefix + p.relative_to(root).as_posix(): (p.read_bytes(), p.stat().st_mode & 0o777)
        for p in root.rglob("*")
        if p.is_file() and not p.is_symlink() and accept(p.relative_to(root))
    }


# Keep runtime sources and their build scripts. Omit unrelated native binaries,
# demo media, tutorials, and generated bundles (except the exact full input).
engine = collect(DIRS["libpd-wasm"], "libpd-wasm-0.1.6/", lambda p:
    p.parts[0] not in {"libs", "samples", "examples", "new_demo_design", "extra-libs", "pure-data"}
    and not str(p).startswith("npm/assets/")
    and not (p.parts[0] == "demo" and p.name.startswith("libpd-") and p.name != "libpd-worklet-full.js"))
engine.update(collect(DIRS["pure-data"], "libpd-wasm-0.1.6/pure-data/", lambda p:
    len(p.parts) == 1 or p.parts[0] in {"src", "extra"}))
engine.update(collect(DIRS["pd-cyclone"], "libpd-wasm-0.1.6/extra-libs/cyclone/", lambda p:
    p.parts[0] not in {"documentation", "md-help"} and p.suffix != ".pdf"))
engine.update(collect(DIRS["pd-else"], "libpd-wasm-0.1.6/extra-libs/else/", lambda p:
    len(p.parts) == 1 or p.parts[0] in {"Abstractions", "LICENSE", "license"}
    or (p.parts[0] == "Source" and (
        len(p.parts) <= 2
        or (p.parts[1] in {"Audio", "Control", "Shared"} and len(p.parts) == 3)
        or (p.parts[1] == "Extra")))))
input_asset = DIRS["libpd-wasm"] / "demo/libpd-worklet-full.js"
if input_asset.read_bytes() != (ROOT / "node_modules/libpd-wasm/assets/libpd-worklet-full.js").read_bytes():
    raise SystemExit("Installed worklet differs from pinned upstream source release")
engine["libpd-wasm-0.1.6/LICH-REBUILD.md"] = ((ROOT / "docs/preview-source.md").read_bytes(), 0o644)
engine["libpd-wasm-0.1.6/lich-worklet.mjs"] = ((ROOT / "scripts/worklet.mjs").read_bytes(), 0o644)
source_hashes = {p: sha(data) for p, (data, _) in sorted(engine.items())}
engine["SOURCE-SHA256.json"] = ((json.dumps(source_hashes, indent=2) + "\n").encode(), 0o644)
engine_name = "libpd-wasm-0.1.6-source.tar.gz"
engine_sha = archive(engine_name, engine)

docs = collect(DIRS["hvcc"], "hvcc-0.17.2/", lambda p:
    p.name in {"LICENSE", "README.md"} or str(p).startswith("docs/reference/"))
# Preserve the copyright/permission notice accompanying hvcc's documentation.
docs["hvcc-0.17.2/compiler-copyright.txt"] = (
    DIRS["hvcc"].joinpath("hvcc/compiler.py").read_bytes().split(b"import importlib")[0], 0o644)
docs_name = "hvcc-0.17.2-docs.tar.gz"
docs_sha = archive(docs_name, docs)
manifest = {
    "libpdWasmVersion": "0.1.6",
    "hvccVersion": "0.17.2",
    "workletSha256": sha(input_asset.read_bytes()),
    "archives": {
        engine_name: {"sha256": engine_sha, "purpose": "Preview engine source and build scripts"},
        docs_name: {"sha256": docs_sha, "purpose": "Original hvcc reference documentation"},
    },
    "upstreams": {name: {"repository": "https://github.com/" + repo, "commit": rev,
        "archive": f"https://codeload.github.com/{repo}/tar.gz/{rev}"}
        for name, (repo, rev) in REVISIONS.items()},
}
(OUT / "upstreams.json").write_text(json.dumps(manifest, indent=2) + "\n")

# Retain file-specific copyright and permission notices as binary-distribution
# documentation too, rather than relying solely on a package's top-level label.
notices = {}
for path, (data, _) in sorted(engine.items()):
    if not path.endswith((".c", ".h", ".cpp")):
        continue
    text = data.decode("utf8", errors="replace")
    blocks = re.findall(r"/\*.*?\*/|(?m:^\s*//[^\n]*(?:\n\s*//[^\n]*)*)", text, re.S)
    selected = [b for b in blocks if re.search(r"copyright|permission|license|licence", b, re.I)]
    if selected:
        for notice in dict.fromkeys(selected):
            notices.setdefault(notice.strip(), []).append(path)
notice_file = ROOT / "THIRD_PARTY_NOTICES.txt"
marker = "\n=== RUNTIME FILE NOTICES ===\n"
base = notice_file.read_text().split(marker)[0]
notice_file.write_text(base + marker +
    "Copyright and permission notices retained from the pinned runtime sources.\n"
    "Identical notices are reproduced once, followed by their source files.\n\n" +
    "\n\n---\n\n".join(notice + "\n\nFiles:\n" + "\n".join(paths)
        for notice, paths in notices.items()) + "\n")
print(f"Packaged {len(engine)} engine files; {engine_name}: {engine_sha}")
