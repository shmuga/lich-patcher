# Lich Patcher

A browser-based patch manager and Pure Data editor for the **Befaco / Rebel Technology Lich**.
Manage patches over USB MIDI, edit `.pd` files and preview audio in your browser.
An optional [compiler server](../lich-patcher-server) builds patches for the hardware.

## Use

1. Open the site in a browser with Web MIDI and SysEx support, such as Chrome or Edge.
2. Connect the Lich through its square USB-B port.
3. Click **Connect** and allow MIDI and SysEx access.

You can upload, download and back up patches, manage a local library, control
parameters, inspect the device and monitor MIDI traffic. Knobs A–D follow the
hardware; remote controls are available for E–H and registered extra parameters.
Firmware flashing is outside this tool's scope.

The Pd editor supports files, subpatches, undo/redo, clickable controls and audio
preview using a built-in drum loop (120 BPM), test tone, microphone or audio file.
Choose **In → drum loop · 120 BPM** to feed it through any patch's audio inputs.
Select an object to see its
reference and open the upstream help patch. Browser preview uses libpd; hardware
builds use Heavy, so some behaviour can differ.

For shortcuts, parameter bindings and protocol notes, see [the detailed guide](docs/details.md).

## Run locally

Use Node.js 20+ and Git. The first docs generation needs network access.

```sh
npm ci
npm run dev       # http://127.0.0.1:8765
npm test
npm run build     # static site in dist/
```

Before development/build, scripts prepare the preview worklet and generate
object documentation from pinned Pure Data and hvcc sources. Production builds
also package licences and corresponding source downloads. No audio compiler is
needed to build the frontend.

The default compiler server is `https://lich-patcher.markorel.ninja`, deployed
separately. To use another server, change the address in the site's settings
or set `VITE_BUILD_SERVER` before building:

```sh
VITE_BUILD_SERVER=http://127.0.0.1:8787 npm run dev
```

## Host on your domain

The repository includes `netlify.toml`: connect the repository to Netlify and
publish `dist/` with `npm ci && npm run build`. Configure a custom domain and HTTPS.
You can also serve the complete `dist/` directory from another static host.
Web MIDI and AudioWorklet require HTTPS or localhost.

Keep `legal.html`, the licence notices and `source/` downloads with the deployment;
the build generates these for the exact application version. The source archives
are separate downloads and do not load when using the editor. If enabling the
compiler, deploy its API separately over HTTPS. Set `VITE_BUILD_SERVER` only
when overriding the default server address.

## Licence and credits

**GPL version 3 or later**, with no warranty. See [LICENSE](LICENSE),
[credits and licensing scope](CREDITS.md), and the full upstream terms in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
Third-party components retain their original notices.

Thanks to Befaco, Rebel Technology, Pure Data, libpd, hyrfilm/libpd-wasm,
Cyclone, ELSE and Wasted Audio. The website's **Source, credits & licences**
link provides the notices, matching source and build instructions.
See [preview source maintenance](docs/preview-source.md) when updating the engine.
