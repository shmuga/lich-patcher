# Lich Patcher details

## Features

- **Patches**: list slots (names, sizes, CRCs), load a slot, download a slot as `.syx`, erase one, or back up every slot into the library.
- **Upload**: drop an OwlProgram `.syx` or `.bin`. The page checks the CRC and reads the patch name from the program header; you then run it from RAM or store it in a slot. Other files go up as resources (wavetables and so on). The page refuses firmware images and won't erase system resources such as `__SETTINGS__`.
- **Library**: your local patch collection in IndexedDB, with `.syx`/`.bin` export.
- **Control**: parameters E–H plus any extras the patch registers, buttons 1–4, a MIDI keyboard, and the patch's `debugMessage` output. The patch sends parameter names when it starts; click *Fetch names* to ask again. The panel shows A–D live but can't set them (see below).
- **Device**: firmware/bootloader version, device ID, CPU/heap/storage meters, firmware settings, restart.
- **Monitor**: decoded MIDI traffic in both directions.
- **Pd editor**: see below.

The virtual panel mirrors the module. Its display follows the hardware behaviour documented in `OpenWare/Lich3/Core/Src/Lich.cpp`. Scroll on the PATCH encoder to choose a slot, then click it to load. Knobs A–D follow the hardware.

## Protocol notes (from OpenWare `Source/`)

- SysEx header `F0 7D 52 <cmd>` (omni device). The device replies with `F0 7D 2x`.
- Upload: `0x10` packets: index 0 = size, then 210 data bytes per packet (8-to-7 bit encoded, 240 bytes), then the CRC32. Then `0x12` run, `0x11 <slot>` store, or `0x17 <name>` save resource. The page's output matches `FirmwareSender` byte for byte.
- Download: `0x18 <slot>` makes the device stream the same `0x10` format back. Resources are slot `40 + n`.
- Erase: `0x14 <slot>`. **An empty payload erases all storage**, so the page always sends a slot.
- Requests: `CC67` = 127 info, 1 patch names, 3 settings (+ program, A–E), 4 resources, 0x24 stats. The firmware drops a pending background request when a new one arrives, so the page queues them and pauses polling during transfers.

## A–D are read-only

OpenWare's `CC26` (PATCH_CONTROL) calls `HAL_ADC_Stop_DMA` / `HAL_ADC_Start_DMA` from the USB interrupt. The H7 HAL's
tick-based timeouts can spin there, and that spin hung the Lich and dropped its USB connection. Even when the call
returns, `updateParameters()` (Source/callbacks.cpp) pulls A–D towards the ADC readings every audio block, so the
firmware overwrites MIDI values for A–D within milliseconds. The page never sends CC26. Remote control of A–D would need a firmware change.

## Pd editor

- **Canvas**: Pd-style boxes and cords.
  - Double-click to add an object. ⌘1 object, ⌘2 message, ⌘3 number, ⌘5 comment, ⇧⌘B bang, ⇧⌘T toggle.
  - Drag from an outlet to an inlet to connect.
  - Selection, copy/paste (also to and from desktop Pd as text), ⌘D duplicate, undo/redo, zoom.
  - ⌘E switches between edit and play. In play mode, click a subpatch to open it.
- **Files**: open and save real `.pd` files, or drop one anywhere on the page. Your browser keeps the current patch as a draft.
- **Lich I/O** follows OwlProgram's Heavy convention.
  - `[r Name @raw A min max default]` reads knob/CV A. B–H and AA–DH work the same way; buttons are `Push`, `B1`–`B11`, `Red`, `Green`.
  - `[s Name @raw F]` writes a parameter. F and G drive the CV outputs.
  - Legacy `@owl` still works. Builds use Wasted Audio's hvcc 0.17.2, which also compiles `expr`/`expr~`, `list` and the cyclone signal objects.
  - The inspector gives you a form for these.
- **Heavy check**: the editor marks objects Heavy can't compile as you type, and keeps Build disabled until the patch is clean. Its list matches the server's validator.
- **Preview**: the patch runs in [libpd-wasm](https://github.com/hyrfilm/libpd-wasm), which is real Pd vanilla.
  - Input: silence, an original CC0 drum loop (two bars at 120 BPM), a test chord, the microphone or a looped audio file, with a scope and level meter. The same input remains available when switching patches; effects receive it through `[adc~]`.
  - Every `@raw` input gets a knob or button, scaled the way the Lich scales it. Outputs get meters.
  - In play mode you can click message boxes, toggles, sliders and number boxes: the preview copy wires hidden `[r __ui_…]`/`[s __uo_…]` to them.
  - The preview reloads on every edit.
  - libpd-wasm ships with zero audio inputs, so `scripts/worklet.mjs` patches its worklet to two. It uses the full build (vanilla, cyclone and ELSE), so the cyclone/ELSE objects Heavy supports also preview. That build is about 5.7 MB, fetched on the first Play.
  - The preview runs libpd and the Lich runs the Heavy build, so edge cases can differ.
- **Build for Lich**: sends the patch to your lich-patcher-server, which runs hvcc and ARM GCC in a sandbox and returns the patch binary.
  - You can run the result from RAM, stage it in the Patches tab to store in a slot, save it as `.syx`, or add it to the library.
  - The button stays disabled until the server's `/health` returns ok, and while you have no server set (⚙).
  - The first build asks you to confirm, since builds cost server time.

## Object docs

Selecting an object shows its docs in the inspector:
- a summary, and what it does differently on the Lich (from hvcc's supported-objects table);
- its inlets, outlets and arguments;
- links: **Help patch ↗** opens Pd's official help patch for it in a new tab, playable in the preview. That tab never touches your draft. There are also links to the source on GitHub and to hvcc's notes.

Palette items and boxes on the canvas show the summary as a tooltip. The docs are about 12 KB gzipped and load the first time the editor opens.

Object reference data and help patches are generated and excluded from version control. Their original notices are retained. Matching preview source archives are committed separately for redistribution.
`npm run docs` (`scripts/pd-docs.mjs`) reads the "reference" sections of Pd's help patches (BSD-3, `doc/5.reference`) and hvcc's `docs/reference/objects/supported.md`, from pinned versions:
- Pd at libpd-wasm's pure-data commit;
- hvcc at the tag the build server uses.

It writes `src/js/pd/docs.json` and copies the help patches to `public/help/`. It runs automatically before `npm run dev` and `npm run build` (so on Netlify too), and skips the fetch while the output matches the pins and the Heavy object list. The first run needs git and network access and takes about 5 s. When you bump Pd or hvcc, change `PD_COMMIT`/`HVCC_TAG` in the script. `npm run docs -- --force` regenerates regardless.

