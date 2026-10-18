// libpd has no GUI, so for the preview each clickable box gets a hidden [r __ui_…] wired to
// its inlet, and each value box a [s __uo_…] on its outlet. The editor sends clicks/drags to
// the first and draws what comes back from the second. Only the preview copy is changed.
import { clone, classOf, eachCanvas, serialize } from "./model.js";

const GUI = new Set(["bng", "tgl", "hsl", "vsl", "nbx", "hradio", "vradio"]);

/** What a node does in play mode: null, or { out: bool } */
export function interactive(n) {
  if (n.kind === "msg") return { out: false };
  if (n.kind === "floatatom") return { out: true };
  if (n.kind === "obj" && GUI.has(classOf(n))) return { out: classOf(n) !== "bng" };
  return null;
}

export const uiIn = key => "__ui_" + key;
export const uiOut = key => "__uo_" + key;

/** → { text, outs: Set<receiver> } where node keys are `${canvasPath}_${index}` */
export function previewPatch(model) {
  const m = clone(model);
  const outs = new Set();
  eachCanvas(m, (cv, path) => {
    // libpd-wasm links cyclone/ELSE statically under their bare names (tanh~, knob)
    for (const n of cv.nodes) if (n.kind === "obj" && /^(cyclone|else)\//.test(n.atoms[0] ?? "")) n.atoms[0] = n.atoms[0].replace(/^\w+\//, "");
    // help patches end in [output~], which starts at volume 0 behind a GUI we don't draw
    for (const n of cv.nodes) if (n.kind === "obj" && n.atoms[0] === "output~") n.atoms = ["dac~"];
    const n0 = cv.nodes.length;
    for (let i = 0; i < n0; i++) {
      const n = cv.nodes[i], ia = interactive(n);
      if (!ia) continue;
      const key = `${path}_${i}`;
      const r = cv.nodes.push({ kind: "obj", x: n.x, y: n.y - 24, atoms: ["r", uiIn(key)], width: null }) - 1;
      cv.conns.push({ from: r, outlet: 0, to: i, inlet: 0 });
      if (ia.out) {
        const s = cv.nodes.push({ kind: "obj", x: n.x, y: n.y + 24, atoms: ["s", uiOut(key)], width: null }) - 1;
        cv.conns.push({ from: i, outlet: 0, to: s, inlet: 0 });
        outs.add(uiOut(key));
      }
    }
  });
  return { text: serialize(m), outs };
}
