// .pd text <-> editable model. Records the editor doesn't understand (graph-on-parent arrays,
// coords, declare …) are kept verbatim so a round trip never loses anything.
//
// Canvas { head: [x, y, w, h, font] | [x, y, w, h, name, vis], nodes: Node[], conns: Conn[], extra: string[][] }
// Node   { kind: obj|msg|text|floatatom|symbolatom|sub|graph, x, y, atoms: string[] (unescaped),
//          width: number|null, fields?: string[] (atom boxes), canvas?: Canvas (sub), raw?: string[][] (graph) }
// Conn   { from, outlet, to, inlet }

/** Split .pd text into records of raw (still escaped) tokens. */
export function records(src) {
  const out = [];
  let cur = "", toks = [];
  const flush = () => { if (cur) { toks.push(cur); cur = ""; } };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length) { cur += c + src[++i]; continue; }
    if (c === ";") { flush(); if (toks.length) out.push(toks); toks = []; continue; }
    if (c === ",") { flush(); toks.push(","); continue; }
    if (/\s/.test(c)) { flush(); continue; }
    cur += c;
  }
  flush();
  if (toks.length) out.push(toks);
  return out;
}

export const unescape = t => t.replace(/\\([$;,\\ ])/g, "$1");
export const escape = a => a === ";" ? "\\;" : a === "," ? "\\," : a.replace(/\$/g, "\\$");

/** Split box text the way Pd does: ; and , are atoms of their own. */
export const textAtoms = text => text.match(/[;,]|[^\s;,]+/g) || [];
export const atomsText = (atoms, kind) => kind === "msg"
  ? atoms.join(" ").replace(/ ?([;,]) ?/g, (m, c) => c === ";" ? ";\n" : ", ").trim()
  : atoms.join(" ");

const newCanvas = head => ({ head, nodes: [], conns: [], extra: [] });

/** Box text → atoms + optional ", f N" width */
function splitWidth(tokens) {
  const i = tokens.lastIndexOf(",");
  if (i >= 0 && tokens[i + 1] === "f" && tokens.length === i + 3 && /^\d+$/.test(tokens[i + 2]))
    return { atoms: tokens.slice(0, i), width: +tokens[i + 2] };
  return { atoms: tokens, width: null };
}

export function parse(src) {
  const recs = records(src);
  if (!recs.length || recs[0][0] !== "#N" || recs[0][1] !== "canvas") throw new Error("Not a Pd patch (must start with #N canvas)");
  const stack = [];
  let root = null, graph = null, graphDepth = 0;

  for (const r of recs) {
    // graph-on-parent canvases (arrays) are kept as raw records
    if (graph) {
      graph.raw.push(r);
      if (r[0] === "#N" && r[1] === "canvas") graphDepth++;
      if (r[0] === "#X" && r[1] === "restore" && --graphDepth === 0) {
        graph.x = +r[2]; graph.y = +r[3];
        stack.at(-1).nodes.push(graph);
        graph = null;
      }
      continue;
    }
    const [a, b] = r;
    if (a === "#N" && b === "canvas") {
      if (!root) { root = newCanvas(r.slice(2)); stack.push(root); continue; }
      // a subpatch whose next record is an array is a graph: peek by pushing a pending canvas
      const c = newCanvas(r.slice(2));
      c.pending = true;
      stack.push(c);
      continue;
    }
    const cv = stack.at(-1);
    if (!cv) throw new Error("Records after the main canvas was closed");
    if (cv.pending && a === "#X" && b === "array") {
      // convert the pending canvas into a raw graph node
      stack.pop();
      graph = { kind: "graph", x: 0, y: 0, atoms: ["array", unescape(r[2] || "")], width: null, raw: [["#N", "canvas", ...cv.head], r] };
      graphDepth = 1;
      continue;
    }
    delete cv.pending;
    if (a === "#X") {
      const x = +r[2], y = +r[3];
      switch (b) {
        case "obj": case "msg": case "text": {
          const { atoms, width } = splitWidth(r.slice(4));
          cv.nodes.push({ kind: b, x, y, atoms: atoms.map(unescape), width });
          break;
        }
        case "floatatom": case "symbolatom":
          cv.nodes.push({ kind: b, x, y, atoms: [], width: null, fields: r.slice(4) });
          break;
        case "restore": {
          stack.pop();
          const parent = stack.at(-1);
          if (!parent) throw new Error("#X restore without a subpatch");
          const { atoms, width } = splitWidth(r.slice(4));
          parent.nodes.push({ kind: "sub", x, y, atoms: atoms.map(unescape), width, canvas: cv });
          break;
        }
        case "connect":
          cv.conns.push({ from: +r[2], outlet: +r[3], to: +r[4], inlet: +r[5] });
          break;
        default:
          cv.extra.push(r);
      }
    } else cv.extra.push(r);
  }
  if (!root) throw new Error("Empty patch");
  return { root };
}

function writeCanvas(cv, out, sub) {
  out.push(["#N", "canvas", ...cv.head]);
  for (const n of cv.nodes) {
    if (n.kind === "graph") { out.push(...n.raw.slice(0, -1), ["#X", "restore", n.x, n.y, "graph"]); continue; }
    const w = n.width ? [",", "f", n.width] : [];
    if (n.kind === "sub") {
      writeCanvas(n.canvas, out, true);
      out.push(["#X", "restore", n.x, n.y, ...n.atoms.map(escape), ...w]);
    } else if (n.kind === "floatatom" || n.kind === "symbolatom") {
      out.push(["#X", n.kind, n.x, n.y, ...n.fields]);
    } else {
      out.push(["#X", n.kind, n.x, n.y, ...n.atoms.map(escape), ...w]);
    }
  }
  for (const e of cv.extra) out.push(e);
  for (const c of cv.conns) out.push(["#X", "connect", c.from, c.outlet, c.to, c.inlet]);
  return sub;
}

export function serialize(model) {
  const out = [];
  writeCanvas(model.root, out, false);
  // Pd writes the width suffix as "osc~ 440, f 12"
  return out.map(r => r.join(" ").replace(/ ,(?= f \d+$)/, ",") + ";").join("\n") + "\n";
}

export const clone = model => parse(serialize(model));

export function emptyPatch() {
  return { root: newCanvas(["0", "50", "600", "400", "12"]) };
}

/** Object class of a node, or null for non-objects. */
export const classOf = n => n.kind === "obj" ? (n.atoms[0] ?? "") : null;

/** Walk every canvas: fn(canvas, path) where path is "0", "0-3", … */
export function eachCanvas(model, fn) {
  const walk = (cv, path) => {
    fn(cv, path);
    cv.nodes.forEach((n, i) => { if (n.kind === "sub") walk(n.canvas, path + "-" + i); });
  };
  walk(model.root, "0");
}

/** Remove nodes (by index set) from a canvas, dropping their connections and renumbering the rest. */
export function removeNodes(cv, idx) {
  const map = new Map();
  let k = 0;
  cv.nodes.forEach((_, i) => { if (!idx.has(i)) map.set(i, k++); });
  cv.nodes = cv.nodes.filter((_, i) => !idx.has(i));
  cv.conns = cv.conns.filter(c => map.has(c.from) && map.has(c.to))
    .map(c => ({ ...c, from: map.get(c.from), to: map.get(c.to) }));
}
