// The patch canvas: SVG drawing of the open (sub)patch plus all mouse/keyboard editing.
import { on, emit } from "../../state.js";
import { $, esc } from "../../util.js";
import { classOf, atomsText, textAtoms, removeNodes, parse, serialize } from "../../pd/model.js";
import { ports } from "../../pd/objects.js";
import { interactive, uiIn } from "../../pd/preview.js";
import { docFor } from "../../pd/docs.js";
import * as Pd from "../../pd/engine.js";
import { E, canvas, nodeKey, change, changed, pushUndo, takeSnapshot, undo, redo } from "./state.js";

const PAD = 4, PW = 7, PH = 3;
// Box text metrics follow the patch's font size (the 5th field of the root "#N canvas"), as in Pd
let FS = 12, CW = 7.2, LH = 15;
function setFont(size) {
  FS = size > 0 && size <= 36 ? size : 12;
  CW = FS * 0.6; LH = Math.round(FS * 1.25);
  $("#edSvg").style.setProperty("--fs", FS + "px");
}
// Pd allows negative coordinates; the SVG starts at (OX, OY) so those boxes stay reachable
let OX = 0, OY = 0;

/* ───────── geometry ───────── */
const num = (v, d) => (v == null || v === "" || isNaN(+v)) ? d : +v;

export function boxText(n) {
  if (n.kind === "text") return wrap(n.atoms.join(" ").replace(/ ([,;])/g, "$1"), n.width || 60);
  if (n.kind === "graph") return n.atoms.join(" ");
  return atomsText(n.atoms, n.kind);
}
function wrap(s, cols) {
  const out = []; let line = "";
  for (const w of s.split(" ")) {
    if (line && line.length + 1 + w.length > cols) { out.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  out.push(line);
  return out.join("\n");
}

export function geom(n) {
  const p = ports(n), cls = classOf(n), a = n.atoms;
  const minW = Math.max(p.ins.length, p.outs.length) * (PW + 4);
  let w, h, gui = null;
  switch (cls) {
    case "tgl": case "bng": w = h = num(a[1], 15); gui = cls; break;
    case "hsl": w = num(a[1], 128); h = num(a[2], 15); gui = cls; break;
    case "vsl": w = num(a[1], 15); h = num(a[2], 128); gui = cls; break;
    case "nbx": w = num(a[1], 5) * CW + 14; h = num(a[2], 14) + 2; gui = cls; break;
    case "hradio": w = num(a[1], 15) * num(a[4], 8); h = num(a[1], 15); gui = cls; break;
    case "vradio": h = num(a[1], 15) * num(a[4], 8); w = num(a[1], 15); gui = cls; break;
    case "cnv": w = num(a[2], 100); h = num(a[3], 60); gui = cls; break;
  }
  if (!gui && (n.kind === "floatatom" || n.kind === "symbolatom")) {
    w = (num(n.fields?.[0], 0) || 5) * CW + 8; h = LH + 4; gui = n.kind;
  }
  if (!gui) {
    const lines = boxText(n).split("\n");
    const chars = n.width || Math.max(1, ...lines.map(l => l.length));
    w = Math.max(chars * CW + PAD * 2, minW, n.kind === "text" ? 10 : 22);
    h = lines.length * LH + 4;
    // arrays: "#X coords x1 y1 x2 y2 width height gop" gives the graph's size on the parent
    const co = n.kind === "graph" && n.raw.findLast(r => r[0] === "#X" && r[1] === "coords");
    if (co && +co[6] > 0 && +co[7] > 0) { w = Math.max(w, +co[6]); h = +co[7]; }
    return { w, h, p, lines };
  }
  return { w: Math.max(w, minW), h, p, gui };
}

const portX = (k, j, w) => k > 1 ? j * (w - PW) / (k - 1) : 0;
export function inletPos(n, j, g = geom(n)) { return [n.x + portX(g.p.ins.length, j, g.w) + PW / 2, n.y]; }
export function outletPos(n, j, g = geom(n)) { return [n.x + portX(g.p.outs.length, j, g.w) + PW / 2, n.y + g.h]; }

/* ───────── drawing ───────── */
const issueAt = new Map();

function guiSvg(n, g, i) {
  const v = E.values.get(nodeKey(i)), a = n.atoms;
  switch (g.gui) {
    case "tgl": return v ? `<path class="gx" d="M2 2L${g.w - 2} ${g.h - 2}M${g.w - 2} 2L2 ${g.h - 2}"/>` : "";
    case "bng": return `<circle class="gb${n._flash ? " on" : ""}" cx="${g.w / 2}" cy="${g.h / 2}" r="${g.w / 2 - 2}"/>`;
    case "hsl": case "vsl": {
      const lo = num(a[3], 0), hi = num(a[4], 127), f = Math.max(0, Math.min(1, ((v ?? lo) - lo) / ((hi - lo) || 1)));
      return g.gui === "hsl" ? `<line class="gk" x1="${f * (g.w - 3) + 1.5}" x2="${f * (g.w - 3) + 1.5}" y1="1" y2="${g.h - 1}"/>`
        : `<line class="gk" y1="${(1 - f) * (g.h - 3) + 1.5}" y2="${(1 - f) * (g.h - 3) + 1.5}" x1="1" x2="${g.w - 1}"/>`;
    }
    case "hradio": case "vradio": {
      const s = num(a[1], 15), k = Math.round(v ?? 0), cells = num(a[4], 8);
      let out = "";
      for (let c = 1; c < cells; c++) out += g.gui === "hradio" ? `<line class="gl" x1="${c * s}" x2="${c * s}" y1="0" y2="${s}"/>` : `<line class="gl" y1="${c * s}" y2="${c * s}" x1="0" x2="${s}"/>`;
      const o = Math.max(0, Math.min(cells - 1, k)) * s;
      return out + `<rect class="gf" x="${g.gui === "hradio" ? o + 3 : 3}" y="${g.gui === "vradio" ? o + 3 : 3}" width="${s - 6}" height="${s - 6}"/>`;
    }
    case "nbx": case "floatatom":
      return `<text class="tx" x="${g.gui === "nbx" ? 12 : PAD}" y="${g.h / 2 + 4}">${esc(fmt(v ?? 0))}</text>`;
    case "symbolatom": return `<text class="tx" x="${PAD}" y="${g.h / 2 + 4}">${esc(v ?? "symbol")}</text>`;
    case "cnv": return `<text class="tx cl" x="4" y="14">${esc(a[6] && a[6] !== "empty" ? a[6] : "")}</text>`;
  }
  return "";
}
const fmt = v => typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 10 ? 3 : 2).replace(/0+$/, "")) : String(v);

function shape(n, g) {
  if (n.kind === "msg") return `<path class="bx" d="M0 0H${g.w + 4}L${g.w} 4V${g.h - 4}L${g.w + 4} ${g.h}H0Z"/>`;
  if (n.kind === "floatatom" || n.kind === "symbolatom") return `<path class="bx" d="M0 0H${g.w - 5}L${g.w} 5V${g.h}H0Z"/>`;
  if (g.gui === "cnv") return `<rect class="cnv" width="${g.w}" height="${g.h}"/>`;
  if (g.gui === "nbx") return `<rect class="bx" width="${g.w}" height="${g.h}"/><path class="gl" d="M2 2L8 ${g.h / 2}L2 ${g.h - 2}"/>`;
  return `<rect class="bx" width="${g.w}" height="${g.h}"/>`;
}

export function render() {
  const cv = canvas();
  setFont(+E.model.root.head[4]);
  issueAt.clear();
  const pk = ["0", ...E.path].join("-");
  for (const is of E.issues) if (is.path === pk) issueAt.set(is.index, is.message);
  const geoms = cv.nodes.map(geom);
  // objects without a known layout get as many ports as their connections use
  for (const c of cv.conns) {
    const a = geoms[c.from]?.p, b = geoms[c.to]?.p;
    if (a) while (a.outs.length <= c.outlet) a.outs.push(a.outs[0] ?? "c");
    if (b) while (b.ins.length <= c.inlet) b.ins.push("c");
  }
  let nodes = "", cords = "", maxX = 400, maxY = 300;
  cv.nodes.forEach((n, i) => {
    const g = geoms[i], cls = classOf(n);
    const bad = issueAt.get(i) || (g.p.unknown && cls ? `[${cls}] isn't a known object` : null);
    const sig = cls?.endsWith("~") ? " sig" : "";
    const c = `nd k-${n.kind}${g.gui ? " gui g-" + g.gui : ""}${E.sel.has(i) ? " sel" : ""}${bad ? " bad" : ""}${sig}${interactive(n) || n.kind === "sub" ? " ia" : ""}`;
    const tip = bad || (cls && docFor(cls)?.summary ? `[${cls}] ${docFor(cls).summary}` : "");
    let s = `<g class="${c}" data-i="${i}" transform="translate(${n.x},${n.y})">${tip ? `<title>${esc(tip)}</title>` : ""}`;
    if (n.kind !== "text" || E.mode === "edit") s += n.kind === "text" ? `<rect class="hit" width="${g.w}" height="${g.h}"/>` : shape(n, g);
    if (g.lines) s += `<text class="tx" x="${PAD}" y="${FS}">${g.lines.map((l, k) => `<tspan x="${PAD}" dy="${k ? LH : 0}">${esc(l) || " "}</tspan>`).join("")}</text>`;
    else s += guiSvg(n, g, i);
    g.p.ins.forEach((t, j) => s += `<rect class="pi${t === "~" ? " s" : ""}" data-in="${j}" x="${portX(g.p.ins.length, j, g.w)}" y="0" width="${PW}" height="${PH}"/>`);
    g.p.outs.forEach((t, j) => s += `<rect class="po${t === "~" ? " s" : ""}" data-out="${j}" x="${portX(g.p.outs.length, j, g.w)}" y="${g.h - PH}" width="${PW}" height="${PH}"/>`);
    nodes += s + "</g>";
    maxX = Math.max(maxX, n.x + g.w + 200); maxY = Math.max(maxY, n.y + g.h + 200);
  });
  cv.conns.forEach((c, k) => {
    const a = cv.nodes[c.from], b = cv.nodes[c.to];
    if (!a || !b) return;
    const ga = geoms[c.from], gb = geoms[c.to];
    const [x1, y1] = outletPos(a, c.outlet, ga), [x2, y2] = inletPos(b, c.inlet, gb);
    const sig = ga.p.outs[c.outlet] === "~" ? " s" : "";
    cords += `<g class="cd${sig}${E.selConn === k ? " sel" : ""}" data-c="${k}"><line class="ch" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="cl" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`;
  });
  $("#edCords").innerHTML = cords;
  $("#edNodes").innerHTML = nodes;
  // keep the origin still while dragging; shift the scroll position when it moves so the view doesn't jump
  if (!drag) {
    const ox = Math.min(0, ...cv.nodes.map(n => n.x - 20)), oy = Math.min(0, ...cv.nodes.map(n => n.y - 20));
    const host = $("#edCanvas");
    host.scrollLeft += (OX - ox) * E.zoom; host.scrollTop += (OY - oy) * E.zoom;
    OX = ox; OY = oy;
  }
  const svg = $("#edSvg");
  svg.setAttribute("width", (maxX - OX) * E.zoom); svg.setAttribute("height", (maxY - OY) * E.zoom);
  $("#edWorld").setAttribute("transform", `scale(${E.zoom}) translate(${-OX},${-OY})`);
  $("#edCanvas").classList.toggle("play", E.mode === "play");
}

/* ───────── pointer handling ───────── */
let drag = null, last = [40, 40];

function world(e) {
  const r = $("#edSvg").getBoundingClientRect();
  return [(e.clientX - r.left) / E.zoom + OX, (e.clientY - r.top) / E.zoom + OY];
}

/** Scroll the canvas so node i of the open canvas is in the middle of the view. */
export function reveal(i) {
  const n = canvas().nodes[i], host = $("#edCanvas");
  if (!n) return;
  const g = geom(n);
  host.scrollTo({
    left: (n.x - OX + g.w / 2) * E.zoom - host.clientWidth / 2,
    top: (n.y - OY + g.h / 2) * E.zoom - host.clientHeight / 2,
    behavior: "smooth",
  });
}
const nodeAt = el => el?.closest?.(".nd") ? +el.closest(".nd").dataset.i : -1;

function onDown(e) {
  if (e.button !== 0 || editing) return;
  $("#edCanvas").focus({ preventScroll: true });
  const [x, y] = last = world(e), cv = canvas();
  const out = e.target.closest?.("[data-out]"), i = nodeAt(e.target), cd = e.target.closest?.(".cd");
  if (E.mode === "play" || e.metaKey && E.mode === "edit" && i >= 0 && !E.sel.has(i)) {
    if (i >= 0) return play(i, e, x, y);
    return;
  }
  if (out && i >= 0) {
    drag = { type: "wire", from: i, outlet: +out.dataset.out, start: outletPos(cv.nodes[i], +out.dataset.out) };
  } else if (i >= 0) {
    if (e.shiftKey) { E.sel.has(i) ? E.sel.delete(i) : E.sel.add(i); }
    else if (!E.sel.has(i)) { E.sel.clear(); E.sel.add(i); }
    E.selConn = null;
    drag = { type: "move", x, y, snap: takeSnapshot(), moved: false, orig: [...E.sel].map(k => [k, cv.nodes[k].x, cv.nodes[k].y]) };
    emit("ed:render"); emit("ed:select");
  } else if (cd) {
    E.sel.clear(); E.selConn = +cd.dataset.c;
    emit("ed:render"); emit("ed:select");
  } else {
    if (!e.shiftKey) E.sel.clear();
    E.selConn = null;
    drag = { type: "marq", x, y, base: new Set(E.sel) };
    emit("ed:render"); emit("ed:select");
  }
  $("#edSvg").setPointerCapture(e.pointerId);
}

function onMove(e) {
  const [x, y] = last = world(e);
  if (!drag) return;
  const cv = canvas();
  if (drag.type === "move") {
    const dx = Math.round(x - drag.x), dy = Math.round(y - drag.y);
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    if (!drag.moved) { pushUndo(drag.snap); drag.moved = true; }
    for (const [k, ox, oy] of drag.orig) { cv.nodes[k].x = Math.max(OX, ox + dx); cv.nodes[k].y = Math.max(OY, oy + dy); }
    render();
  } else if (drag.type === "wire") {
    $("#edDrag").setAttribute("d", `M${drag.start[0]} ${drag.start[1]}L${x} ${y}`);
  } else if (drag.type === "marq") {
    const [x0, x1] = [Math.min(drag.x, x), Math.max(drag.x, x)], [y0, y1] = [Math.min(drag.y, y), Math.max(drag.y, y)];
    const m = $("#edMarq");
    m.setAttribute("x", x0); m.setAttribute("y", y0); m.setAttribute("width", x1 - x0); m.setAttribute("height", y1 - y0);
    E.sel = new Set(drag.base);
    cv.nodes.forEach((n, k) => { const g = geom(n); if (n.x < x1 && n.x + g.w > x0 && n.y < y1 && n.y + g.h > y0) E.sel.add(k); });
    $$sel();
  } else if (drag.type === "value") {
    drag.onMove(x, y, e);
  }
}
// cheap selection refresh during marquee
function $$sel() { document.querySelectorAll("#edNodes .nd").forEach(g => g.classList.toggle("sel", E.sel.has(+g.dataset.i))); }

function onUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.type === "move") { if (d.moved) changed(true); }
  else if (d.type === "marq") { $("#edMarq").setAttribute("width", 0); emit("ed:select"); }
  else if (d.type === "wire") {
    $("#edDrag").setAttribute("d", "");
    const el = document.elementFromPoint(e.clientX, e.clientY), j = nodeAt(el);
    if (j >= 0 && j !== d.from) connectTo(d, j, world(e)[0]);
  } else if (d.type === "value") d.onUp?.();
}

function connectTo(d, j, x) {
  const cv = canvas(), n = cv.nodes[j], g = geom(n);
  if (!g.p.ins.length) return;
  let best = 0, bd = Infinity;
  g.p.ins.forEach((_, k) => { const dd = Math.abs(inletPos(n, k, g)[0] - x); if (dd < bd) { bd = dd; best = k; } });
  if (cv.conns.some(c => c.from === d.from && c.outlet === d.outlet && c.to === j && c.inlet === best)) return;
  change(() => cv.conns.push({ from: d.from, outlet: d.outlet, to: j, inlet: best }));
}

/* ───────── play mode ───────── */
function play(i, e, x, y) {
  const cv = canvas(), n = cv.nodes[i], key = nodeKey(i), cls = classOf(n), g = geom(n);
  if (n.kind === "sub") { openSub(i); return; }
  if (!interactive(n)) return;
  const send = v => { E.values.set(key, v); Pd.sendFloat(uiIn(key), v); render(); };
  if (n.kind === "msg" || cls === "bng") {
    Pd.sendBang(uiIn(key));
    n._flash = true; render(); setTimeout(() => { n._flash = false; render(); }, 150);
    return;
  }
  if (cls === "tgl") return send(E.values.get(key) ? 0 : num(n.atoms[n.atoms.length - 1], 1) || 1);
  if (cls === "hradio" || cls === "vradio") {
    const s = num(n.atoms[1], 15);
    return send(Math.floor((cls === "hradio" ? x - n.x : y - n.y) / s));
  }
  if (cls === "hsl" || cls === "vsl") {
    const lo = num(n.atoms[3], 0), hi = num(n.atoms[4], 127);
    const at = (px, py) => {
      const f = cls === "hsl" ? (px - n.x) / g.w : 1 - (py - n.y) / g.h;
      send(lo + Math.max(0, Math.min(1, f)) * (hi - lo));
    };
    at(x, y);
    drag = { type: "value", onMove: at };
  } else {
    // number boxes: drag up/down, shift for fine steps
    const v0 = +(E.values.get(key) ?? 0), y0 = y;
    const lo = n.kind === "nbx" ? num(n.atoms[3], -1e37) : num(n.fields?.[1], 0), hi = n.kind === "nbx" ? num(n.atoms[4], 1e37) : num(n.fields?.[2], 0);
    drag = {
      type: "value", onMove: (px, py, ev) => {
        let v = v0 + (y0 - py) * (ev.shiftKey ? 0.01 : 1);
        if (!ev.shiftKey) v = Math.round(v);
        if (hi > lo) v = Math.max(lo, Math.min(hi, v));
        send(+v.toFixed(4));
      },
    };
  }
  $("#edSvg").setPointerCapture(e.pointerId);
}

/* ───────── text editing ───────── */
let editing = null;
export function startEdit(i, fresh = false) {
  const cv = canvas(), n = cv.nodes[i];
  if (!n || ["floatatom", "symbolatom", "graph"].includes(n.kind)) return;
  const g = geom(n), ta = $("#edInput"), r = $("#edSvg").getBoundingClientRect(), host = $("#edCanvas").getBoundingClientRect();
  editing = { i, fresh, snap: takeSnapshot() };
  ta.value = fresh ? "" : boxText(n).replace(/\n(?=.)/g, n.kind === "msg" ? "\n" : " ");
  Object.assign(ta.style, {
    left: (r.left - host.left + $("#edCanvas").scrollLeft + (n.x - OX) * E.zoom) + "px",
    top: (r.top - host.top + $("#edCanvas").scrollTop + (n.y - OY) * E.zoom) + "px",
    fontSize: FS * E.zoom + "px", lineHeight: LH * E.zoom + "px", minWidth: Math.max(g.w, 60) * E.zoom + "px",
  });
  ta.classList.remove("hidden");
  autosize();
  ta.focus(); ta.select();
}
function autosize() {
  const ta = $("#edInput");
  ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px";
  ta.style.width = "auto"; ta.style.width = Math.max(60 * E.zoom, (Math.max(...ta.value.split("\n").map(l => l.length)) + 2) * CW * E.zoom) + "px";
}
function endEdit(commit) {
  if (!editing) return;
  const { i, fresh, snap } = editing, ta = $("#edInput");
  editing = null;
  ta.classList.add("hidden");
  $("#edCanvas").focus({ preventScroll: true });
  const cv = canvas(), n = cv.nodes[i], text = ta.value.trim();
  if (!commit) { if (fresh) { removeNodes(cv, new Set([i])); E.sel.clear(); changed(); } return; }
  if (!text && n.kind !== "msg") { pushUndo(snap); removeNodes(cv, new Set([i])); E.sel.clear(); changed(); return; }
  const atoms = textAtoms(text);
  if (!fresh && atoms.join(" ") === n.atoms.join(" ")) return;
  pushUndo(snap);
  if (n.kind === "obj" || n.kind === "sub") {
    if (atoms[0] === "pd") {
      if (n.kind !== "sub") { n.kind = "sub"; n.canvas = { head: ["0", "50", "450", "300", atoms[1] || "subpatch", "0"], nodes: [], conns: [], extra: [] }; }
      else n.canvas.head[4] = atoms[1] || "subpatch";
    } else if (n.kind === "sub") { n.kind = "obj"; delete n.canvas; }
  }
  n.atoms = atoms;
  // keep only connections that still fit the new box
  const g = geom(n);
  cv.conns = cv.conns.filter(c => (c.from !== i || c.outlet < g.p.outs.length) && (c.to !== i || c.inlet < g.p.ins.length));
  changed();
}

/* ───────── commands ───────── */
export function place(kind, text = "", at = last) {
  const cv = canvas();
  const [x, y] = at.map(Math.round);
  let n;
  if (kind === "floatatom") n = { kind, x, y, atoms: [], width: null, fields: ["5", "0", "0", "0", "-", "-", "-"] };
  else if (kind === "obj" && /^(tgl|bng)$/.test(text)) n = { kind, x, y, atoms: [text, "15", ...(text === "bng" ? ["250", "50"] : []), "0", "empty", "empty", "empty", "17", "7", "0", "10", "#fcfcfc", "#000000", "#000000", ...(text === "tgl" ? ["0", "1"] : [])], width: null };
  else n = { kind, x, y, atoms: textAtoms(text), width: null };
  if (kind === "obj" && n.atoms[0] === "pd") { n.kind = "sub"; n.canvas = { head: ["0", "50", "450", "300", n.atoms[1] || "subpatch", "0"], nodes: [], conns: [], extra: [] }; }
  let i;
  change(() => { i = cv.nodes.push(n) - 1; E.sel = new Set([i]); E.selConn = null; });
  emit("ed:select");
  if (!text && kind !== "floatatom") setTimeout(() => startEdit(i, true));
  return i;
}

export function deleteSelection() {
  const cv = canvas();
  if (E.selConn != null) { const k = E.selConn; change(() => { cv.conns.splice(k, 1); E.selConn = null; }); return; }
  if (!E.sel.size) return;
  change(() => { removeNodes(cv, E.sel); E.sel.clear(); });
  emit("ed:select");
}

function snippet() {
  const cv = canvas(), idx = [...E.sel].sort((a, b) => a - b), map = new Map(idx.map((k, j) => [k, j]));
  const root = { head: ["0", "50", "450", "300", "12"], nodes: idx.map(k => cv.nodes[k]), extra: [],
    conns: cv.conns.filter(c => map.has(c.from) && map.has(c.to)).map(c => ({ ...c, from: map.get(c.from), to: map.get(c.to) })) };
  return serialize({ root });
}
let clip = "";
export function copy() { if (!E.sel.size) return; clip = snippet(); navigator.clipboard?.writeText(clip).catch(() => {}); }
export function cut() { copy(); deleteSelection(); }
export function paste(text = clip, offset = 10) {
  if (!text) return;
  if (!/^\s*#N canvas/.test(text)) text = "#N canvas 0 50 450 300 12;\n" + text;
  let src;
  try { src = parse(text).root; } catch { return; }
  const cv = canvas(), base = cv.nodes.length;
  change(() => {
    for (const n of src.nodes) { n.x += offset; n.y += offset; cv.nodes.push(n); }
    for (const c of src.conns) cv.conns.push({ ...c, from: c.from + base, to: c.to + base });
    E.sel = new Set(src.nodes.map((_, k) => base + k)); E.selConn = null;
  });
  emit("ed:select");
}
export const duplicate = () => { if (E.sel.size) paste(snippet(), 10); };

export function openSub(i) {
  if (canvas().nodes[i]?.kind !== "sub") return;
  E.path.push(i); E.sel.clear(); E.selConn = null;
  emit("ed:render"); emit("ed:select"); emit("ed:path");
}
export function upTo(depth) {
  E.path.length = depth; E.sel.clear(); E.selConn = null;
  emit("ed:render"); emit("ed:select"); emit("ed:path");
}
export function setMode(m) { E.mode = m; emit("ed:mode"); render(); }
export function setZoom(z) { E.zoom = Math.max(0.5, Math.min(2.5, Math.round(z * 10) / 10)); render(); emit("ed:zoom"); }

function onKey(e) {
  if (!$("#v-editor").classList.contains("on") || editing) return;
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), cv = canvas();
  const go = fn => { e.preventDefault(); fn(); };
  if (mod && k === "e") return go(() => setMode(E.mode === "edit" ? "play" : "edit"));
  if (mod && k === "z") return go(() => e.shiftKey ? redo() : undo());
  if (mod && k === "y") return go(redo);
  if (mod && e.key === "=" || mod && e.key === "+") return go(() => setZoom(E.zoom + 0.1));
  if (mod && e.key === "-") return go(() => setZoom(E.zoom - 0.1));
  if (mod && k === "0") return go(() => setZoom(1));
  if (E.mode !== "edit") return;
  if (mod && k === "1") return go(() => place("obj"));
  if (mod && k === "2") return go(() => place("msg"));
  if (mod && k === "3") return go(() => place("floatatom"));
  if (mod && k === "5") return go(() => place("text", "comment"));
  if (mod && e.shiftKey && k === "b") return go(() => place("obj", "bng"));
  if (mod && e.shiftKey && k === "t") return go(() => place("obj", "tgl"));
  if (mod && k === "a") return go(() => { E.sel = new Set(cv.nodes.map((_, i) => i)); render(); emit("ed:select"); });
  if (mod && k === "d") return go(duplicate);
  if (mod && k === "c") return go(copy);
  if (mod && k === "x") return go(cut);
  if (k === "backspace" || k === "delete") return go(deleteSelection);
  if (k === "enter" && E.sel.size === 1) return go(() => startEdit([...E.sel][0]));
  if (k === "escape") return go(() => { E.sel.clear(); E.selConn = null; render(); emit("ed:select"); });
  const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (arrows && E.sel.size) return go(() => {
    const s = e.shiftKey ? 10 : 1;
    change(() => E.sel.forEach(i => { cv.nodes[i].x = Math.max(OX, cv.nodes[i].x + arrows[0] * s); cv.nodes[i].y = Math.max(OY, cv.nodes[i].y + arrows[1] * s); }), { soft: true });
  });
}

export function initCanvas() {
  const svg = $("#edSvg"), ta = $("#edInput"), host = $("#edCanvas");
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
  svg.addEventListener("dblclick", e => {
    if (E.mode !== "edit") return;
    const i = nodeAt(e.target);
    if (i >= 0) startEdit(i); else place("obj", "", world(e));
  });
  host.addEventListener("wheel", e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault(); setZoom(E.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  // drop palette items or .pd files onto the canvas
  host.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-pd-object")) { e.preventDefault(); e.stopPropagation(); } });
  host.addEventListener("drop", e => {
    const t = e.dataTransfer.getData("text/x-pd-object");
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (E.mode !== "edit") setMode("edit");
    place("obj", t, world(e));
  });
  ta.addEventListener("input", autosize);
  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); endEdit(true); }
    else if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
    e.stopPropagation();
  });
  ta.addEventListener("blur", () => endEdit(true));
  addEventListener("keydown", onKey);
  document.addEventListener("paste", e => {
    if (!$("#v-editor").classList.contains("on") || editing || E.mode !== "edit") return;
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const t = e.clipboardData?.getData("text/plain");
    if (t && /#[NX] /.test(t)) { e.preventDefault(); paste(t); }
    else if (clip) { e.preventDefault(); paste(clip); }
  });
  on("ed:render", render);
  on("docs", render);   // box tooltips show the doc summary
  on("pd:float", ({ receiver, value }) => {
    if (!receiver.startsWith("__uo_")) return;
    E.values.set(receiver.slice(5), value);
    scheduleRender();
  });
}
let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
