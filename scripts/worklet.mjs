// Copies libpd-wasm's AudioWorklet into public/ with audio input enabled. The "full" build
// (vanilla + cyclone + ELSE) is used because Heavy also compiles cyclone/*~ and else/knob.
// The published worklet opens libpd with 0 input channels, which silences [adc~];
// Lich patches are mostly effects, so we patch it to 2 inputs and copy the input buffers in.
// Runs before `vite` and `vite build` (see package.json).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const src = new URL("../node_modules/libpd-wasm/assets/libpd-worklet-full.js", import.meta.url);
const dst = new URL("../public/libpd-worklet.js", import.meta.url);

let js = readFileSync(src, "utf8");
const provenance = JSON.parse(readFileSync(new URL("../public/source/upstreams.json", import.meta.url), "utf8"));
if (createHash("sha256").update(js).digest("hex") !== provenance.workletSha256) {
  throw new Error("The preview worklet changed. Review its licences and regenerate its matching source package.");
}
const swap = (from, to) => {
  if (!js.includes(from)) throw new Error(`libpd-wasm changed: "${from}" not found in the worklet`);
  js = js.replace(from, to);
};
swap("var IN_CH = 0;", "var IN_CH = 2;");
swap("this.processFloat(TICKS, this.inPtr, this.outPtr);", `{
        const inp = _inputs[0], heap = this.lib.HEAPF32, base = this.inPtr >> 2;
        for (let ch = 0; ch < IN_CH; ch++) {
          const src = inp && (inp[ch] || inp[0]);
          for (let i = 0; i < QUANTUM; i++) heap[base + i * IN_CH + ch] = src ? src[i] : 0;
        }
      }
      this.processFloat(TICKS, this.inPtr, this.outPtr);`);

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(dst, `// libpd-wasm 0.1.6 full runtime: GPL-3.0-or-later combined distribution.
// Original components retain their BSD/WTFPL/other notices. See legal.html and THIRD_PARTY_NOTICES.txt.
// Modified 2026-10-18 by Lich Patcher contributors: two audio inputs and input-buffer copying.
// Matching source: source/libpd-wasm-0.1.6-source.tar.gz; local changes: scripts/worklet.mjs.
// Generated file; do not edit.
` + js);
console.log("public/libpd-worklet.js written (2 inputs)");
