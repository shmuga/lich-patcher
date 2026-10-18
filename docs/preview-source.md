# Browser preview source

The website distributes a modified libpd-wasm 0.1.6 full AudioWorklet, including
Pure Data, Cyclone and ELSE. Its combined runtime is distributed under GPLv3 or
later, with the original BSD, WTFPL and other file-specific notices preserved.
In particular, ELSE's `giga.rev~` (Juhana Sadeharju / Alexandre Torres Porres) and
`fdn.rev~` (Tom Schouten / Alexandre Torres Porres) are GPLv2-or-later.

`public/source/upstreams.json` pins all five upstream repositories and records
the SHA-256 of the original worklet and both redistributable source archives.
The original full worklet in that revision is byte-identical to the npm asset.

## Rebuild the runtime

1. Extract `public/source/libpd-wasm-0.1.6-source.tar.gz` and enter `libpd-wasm-0.1.6`.
2. Install Nix with flakes support and use the included `flake.nix` / `flake.lock`,
   or install the tools listed in upstream `build.sh` yourself. The script uses
   Bash 4.3+ (including `local -n`), Emscripten, CMake, make, esbuild and OCaml/dune.
3. Run `nix develop --command bash scripts/build-wasm.sh`.
   This generates `demo/libpd-worklet-full.js` as well as the other variants.
   The bundled source directories are already populated; no git submodule step
   is needed. A rebuild can differ bytewise with different compiler versions.
4. Back in Lich Patcher, put the rebuilt full worklet at
   `node_modules/libpd-wasm/assets/libpd-worklet-full.js`. Update the recorded
   input hash and regenerate the source archive when changing a release.
5. Run `npm run worklet`. `scripts/worklet.mjs` changes the audio input count
   from zero to two and copies incoming samples into libpd's input buffer.
   Those are the only local runtime modifications (18 October 2026).

The archive includes the original full worklet, the patch script as
`lich-worklet.mjs`, upstream runtime source, abstractions, build scripts and
toolchain lock file. `SOURCE-SHA256.json` records every included file's digest.
Unrelated native binaries, demo media, tutorials and external-library subtrees
that the upstream WASM build excludes are omitted. Source text and existing
permission notices are preserved. The `lich-worklet.mjs` copy is a reference;
run the repository's `scripts/worklet.mjs` in its normal directory layout.

## Updating a dependency

Download and extract the pinned GitHub archives listed in `upstreams.json`
into a temporary directory. They unpack as `NAME-COMMIT/`. Run:

```sh
python3 scripts/vendor-sources.py /path/to/extracted/archives
npm run build
```

When updating versions, change the revisions and archive names in that script,
review the upstream build's source selection and each new component's licence,
and update the notices. Keep the source packages available alongside every
deployed release. Merely installing a new npm binary is insufficient.

## Scope and verification

This covers this repository's browser runtime and extracted reference docs.
The separate `lich-patcher-server`, its containers, firmware, and binaries it
returns need their own notices and corresponding-source handling.

The packaging audit matched the original npm worklet to the pinned release
and inspected its build script and source selection. A complete Emscripten/Nix
rebuild was not performed in the audit environment, where those tools were absent.
