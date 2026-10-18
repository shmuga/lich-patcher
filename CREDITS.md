# Credits and licensing

Lich Patcher is free software, copyright © 2026 Lich Patcher contributors,
licensed under **GNU GPL version 3 or later**; see [LICENSE](LICENSE).
You may use, modify and redistribute it under those terms. There is no warranty.
Original third-party material keeps its own copyright and permission notices;
the project licence does not replace those notices.

The main difference from MIT is redistribution: MIT permits closed-source
derivatives, while GPL requires distributed derivative programs to remain under
compatible GPL terms and provide corresponding source. Both permit commercial
use. Neither requires you to charge, and neither prohibits others from charging.

## Included components

| Component | Credit and source | Licence / use here |
| --- | --- | --- |
| Pure Data 0.56-2 | [Miller Puckette and contributors](https://github.com/pure-data/pure-data/tree/b1ff370c87b579f80130a9cafbf27cd890e90882); individual files also credit IRCAM and other authors | BSD-3-Clause; engine, help patches and extracted reference text |
| libpd / libpd-wasm 0.1.6 | [libpd contributors](https://github.com/libpd/libpd), [hyrfilm/libpd-wasm](https://github.com/hyrfilm/libpd-wasm/tree/5336aeff897fde33e48af23432924a450f61fda6) | BSD base code; the full runtime also includes the external libraries below |
| Cyclone | [Krzysztof Czaja, Hans-Christoph Steiner, Fred Jan Kraan, Alexandre Porres, Derek Kwan, Matt Barber and others](https://github.com/porres/pd-cyclone/tree/d2cff143021c8b1a1f3cd5c71cdb32c5576ba85a) | BSD-3-Clause; preview externals |
| ELSE | [Alexandre Torres Porres and contributors](https://github.com/porres/pd-else/tree/bd3fbb5a688276dcf650de8bb6a18ec0fd6017b0) | Mostly WTFPL, with file-specific GPL and permissive notices; preview externals and abstractions |
| ELSE `giga.rev~` | Juhana Sadeharju, adapted by Alexandre Torres Porres | GPL-2.0-or-later; included in the full preview |
| ELSE `fdn.rev~` | Tom Schouten, adapted by Alexandre Torres Porres | GPL-2.0-or-later; included in the full preview |
| ELSE OSC routing | Martin Peach, Adrian Freed and the Regents of the University of California | Source-specific GNU/UC permission notices retained; not described as simply MIT |
| hvcc 0.17.2 | [Enzien Audio (2014–2018), Wasted Audio (2021–2026) and contributors](https://github.com/Wasted-Audio/hvcc/tree/de4b13fa0e9daec14fe0414ac1bce28370298b4a) | GPL-3.0-or-later; extracted object limitations and compiler compatibility information |
| Emscripten / musl | Emscripten authors; Rich Felker and other musl contributors | MIT/NCSA and file-specific runtime notices |
| Barlow / Barlow Condensed | Jeremy Tribby | SIL Open Font License 1.1; loaded from Google Fonts |
| JetBrains Mono | JetBrains and contributors | SIL Open Font License 1.1; loaded from Google Fonts |
| Vite browser helper | Vite contributors | MIT; the module-preload helper included in production JavaScript |
| Preview drum loop | Original synthesis for Lich Patcher; no sampled recordings | CC0 1.0; two bars at 120 BPM |

The audio file `public/audio/drum-loop-120.wav` is dedicated to the public domain
under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
It may be used, copied, modified and redistributed without attribution,
including commercially. Recreate it with `python3 scripts/drum-loop.py`.
The generator code remains covered by the project GPL licence.

The combined preview runtime is distributed under GPLv3-or-later with its
component notices retained. The generator's former “BSD-3-Clause” label applied
only to the base library and did not describe the full runtime.
The upstream WASM build excludes objects needing unavailable native libraries,
including `beat~`, `conv~`, file-decoding and networking objects; it does not
compile the nested `sfont~` and `sfz~` source trees. Their complete native
dependency trees and ELSE's separate tutorial are not bundled here.

Full licence texts, original file-specific copyright and permission notices,
font licences and the Vite browser helper notice are in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). These notices are also shipped
with the website. Sources retain their own notices inside the downloads.

## Hardware and interoperability references

Thanks to [Befaco](https://www.befaco.org/lich/) and
[Rebel Technology](https://www.rebeltech.org/) for the Lich and OWL ecosystem.
[OpenWare](https://github.com/RebelTechnology/OpenWare) (GPLv2) supplies the
reference for MIDI command values, transfer format and display behaviour.
[OwlProgram](https://github.com/RebelTechnology/OwlProgram) supplies the reference
for patch headers and the `@raw` / `@owl` parameter conventions.

This frontend communicates with firmware over MIDI; it does not link or bundle
OpenWare or OwlProgram firmware code. The previous byte-by-byte SysEx decoder
was replaced on 18 October 2026 with a packet-based implementation of the wire
format. Display masks are now generated from the names of the lit segments,
preserving hardware glyph behaviour without reproducing the firmware's table.
Protocol constants and compatibility facts are retained as interface data.
This is a source review and rewrite, not a claim of a separate clean-room team.

The starter patches and interface code are part of Lich Patcher. Opening a
user's patch does not assign its copyright to this project or automatically
relicense it. Compilation may incorporate runtime code with separate terms.
Lich Patcher is independent; names identify compatibility and do not imply
endorsement by upstream authors or hardware manufacturers.

## Source availability and maintenance

Every production build provides application source, the pinned preview engine
source and original hvcc reference documentation through `legal.html`.
The preview's original asset is checked against its pinned source release;
source archive checksums are verified before building the site.
See [preview source and rebuild instructions](docs/preview-source.md).

This review covers this frontend and its browser assets. The separate compiler
server, its container images, firmware and generated Lich binaries need their
own dependency and corresponding-source review before distribution. Nothing
in this repository purports to relicense those separate projects.
