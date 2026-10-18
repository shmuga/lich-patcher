// Preview card: runs the patch in libpd with virtual Lich controls for every @owl binding.
import { on, emit } from "../../state.js";
import { $, esc, toast, store } from "../../util.js";
import * as Pd from "../../pd/engine.js";
import { previewPatch } from "../../pd/preview.js";
import { bindings } from "../../pd/owl.js";
import { E } from "./state.js";

const knob = new Map();   // binding key → 0..1, like the Lich parameter
const outs = new Map();   // binding name → last raw value
let binds = [], sig = "", reloadT = 0, loadedOnce = false;
let auto = store.get("lich-pd-auto") !== "0";

const scaled = b => b.min + (knob.get(b.key) ?? 0) * (b.max - b.min);
const fmt = v => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
const say = (text, kind) => emit("ed:console", { kind, text });

function defaults(b) {
  if (knob.has(b.key)) return;
  knob.set(b.key, b.button ? 0 : b.def != null && b.max !== b.min ? Math.max(0, Math.min(1, (b.def - b.min) / (b.max - b.min))) : 0.5);
}

/* ───────── controls ───────── */
function knobSvg(v) {
  const r = 22, a0 = -135, a = a0 + 270 * v, pt = d => [26 + r * Math.sin(d * Math.PI / 180), 26 - r * Math.cos(d * Math.PI / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(135), [xv, yv] = pt(a);
  return `<svg viewBox="0 0 52 52"><path d="M${x0} ${y0}A${r} ${r} 0 1 1 ${x1} ${y1}" class="trk"/>
    ${v > 0.001 ? `<path d="M${x0} ${y0}A${r} ${r} 0 ${a - a0 > 180 ? 1 : 0} 1 ${xv} ${yv}" class="lvl"/>` : ""}
    <circle cx="26" cy="26" r="15" class="cap"/><line x1="26" y1="26" x2="${26 + 12 * Math.sin(a * Math.PI / 180)}" y2="${26 - 12 * Math.cos(a * Math.PI / 180)}" class="ind"/></svg>`;
}

function renderControls() {
  const ins = binds.filter(b => b.dir === "in"), o = binds.filter(b => b.dir === "out");
  ins.forEach(defaults);
  $("#pvKnobs").innerHTML = ins.length ? ins.map(b => b.button
    ? `<div class="pk btn-k" data-k="${esc(b.key)}"><button class="pbtn${knob.get(b.key) ? " on" : ""}" data-btn="${esc(b.key)}"></button><b>${esc(b.key)}</b><span>${esc(b.name)}</span></div>`
    : `<div class="pk" data-k="${esc(b.key)}" title="Drag up/down · double-click resets · shift for fine"><div class="kn">${knobSvg(knob.get(b.key))}</div><b>${esc(b.key)}</b><span>${esc(b.name)}</span><i>${fmt(scaled(b))}</i></div>`).join("")
    : `<p class="note">Add <code>[r Name @raw A]</code> to get a knob here.</p>`;
  $("#pvOuts").innerHTML = o.map(b => `<div class="po" data-n="${esc(b.name)}"><b>${esc(b.key)}</b><span>${esc(b.name)}</span><div class="meter"><i></i></div><em>–</em></div>`).join("");
  renderOuts();
}
function renderOuts() {
  for (const b of binds.filter(b => b.dir === "out")) {
    const el = $(`#pvOuts .po[data-n="${CSS.escape(b.name)}"]`);
    if (!el) continue;
    const v = outs.get(b.name);
    el.querySelector("i").style.width = v == null ? "0" : Math.max(0, Math.min(1, (v - b.min) / ((b.max - b.min) || 1))) * 100 + "%";
    el.querySelector("em").textContent = v == null ? "–" : fmt(v);
  }
}
function sendKnob(b) {
  if (!Pd.audio()) return;
  Pd.sendFloat(b.name, b.button ? (knob.get(b.key) ? b.max : b.min) : scaled(b));
}
function updateKnob(el, b) {
  el.querySelector(".kn").innerHTML = knobSvg(knob.get(b.key));
  el.querySelector("i").textContent = fmt(scaled(b));
  sendKnob(b);
}

function initKnobs() {
  const host = $("#pvKnobs");
  let drag = null;
  const find = k => binds.find(b => b.dir === "in" && b.key === k);
  host.addEventListener("pointerdown", e => {
    const btn = e.target.closest("[data-btn]");
    if (btn) {
      const b = find(btn.dataset.btn); if (!b) return;
      knob.set(b.key, 1); btn.classList.add("on"); sendKnob(b);
      const up = () => { knob.set(b.key, 0); btn.classList.remove("on"); sendKnob(b); removeEventListener("pointerup", up); };
      addEventListener("pointerup", up);
      return;
    }
    const el = e.target.closest(".pk:not(.btn-k)");
    if (!el) return;
    const b = find(el.dataset.k); if (!b) return;
    drag = { el, b, y: e.clientY, v: knob.get(b.key) };
    el.setPointerCapture(e.pointerId);
  });
  host.addEventListener("pointermove", e => {
    if (!drag) return;
    const v = Math.max(0, Math.min(1, drag.v + (drag.y - e.clientY) / (e.shiftKey ? 600 : 150)));
    knob.set(drag.b.key, v); updateKnob(drag.el, drag.b);
  });
  const end = () => { drag = null; };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
  host.addEventListener("dblclick", e => {
    const el = e.target.closest(".pk:not(.btn-k)"); if (!el) return;
    const b = find(el.dataset.k); if (!b) return;
    knob.delete(b.key); defaults(b); updateKnob(el, b);
  });
  host.addEventListener("wheel", e => {
    const el = e.target.closest(".pk:not(.btn-k)"); if (!el) return;
    e.preventDefault();
    const b = find(el.dataset.k);
    knob.set(b.key, Math.max(0, Math.min(1, knob.get(b.key) - Math.sign(e.deltaY) * 0.02))); updateKnob(el, b);
  }, { passive: false });
}

/* ───────── engine ───────── */
async function reload() {
  if (!Pd.audio()) return;
  const { text, outs: ui } = previewPatch(E.model);
  const names = new Set(ui);
  for (const b of binds) if (b.dir === "out") names.add(b.name);
  Pd.setBinds(names);
  try {
    await Pd.load(text, E.extraFiles);
    for (const b of binds) if (b.dir === "in") sendKnob(b);
    if (!loadedOnce) say("Preview running in libpd (Pd vanilla). The Lich runs the Heavy build, which can differ in edge cases.", "info");
    loadedOnce = true;
    setStatus();
  } catch (e) { say(e.message, "err"); }
}
function scheduleReload(soft) { if (soft || !auto || !Pd.audio()) return; clearTimeout(reloadT); reloadT = setTimeout(reload, 250); }

async function togglePlay() {
  try {
    if (Pd.isRunning()) { await Pd.pause(); }
    else {
      const first = !Pd.audio();
      await Pd.play();
      if (first) { await Pd.setInput($("#pvInput").value === "file" ? "none" : $("#pvInput").value); Pd.setVolume(+$("#pvVol").value); }
      await reload();
      drawScope();
    }
  } catch (e) { toast("Preview failed: " + e.message, "err", 6000); say(String(e.message || e), "err"); }
  setStatus();
}

function setStatus() {
  const on = Pd.isRunning();
  $("#pvPlay").textContent = on ? "■ Stop" : "▶ Play";
  $("#pvPlay").classList.toggle("primary", !on);
  $("#pvDot").className = "dot" + (on ? " on" : "");
  $("#pvState").textContent = on ? `running · ${Pd.audio().sampleRate / 1000} kHz` : Pd.audio() ? "stopped" : "off";
}

/* ───────── scope ───────── */
let buf = null;
function drawScope() {
  const cv = $("#pvScope"), an = Pd.scope();
  if (!an || !Pd.isRunning()) { $("#pvLvl").style.width = "0"; return; }
  if (document.hidden || !$("#v-editor").classList.contains("on")) { setTimeout(drawScope, 500); return; }
  buf ??= new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(buf);
  const w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = cv.clientHeight * devicePixelRatio, g = cv.getContext("2d");
  // trigger on a rising zero crossing so periodic signals stand still
  let start = 0;
  for (let i = 1; i < buf.length / 2; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.strokeStyle = "#ff5a4e"; g.lineWidth = 1.6 * devicePixelRatio; g.beginPath();
  const n = buf.length / 2;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[start + i] ?? 0; peak = Math.max(peak, Math.abs(v));
    const x = i / (n - 1) * w, y = h / 2 - v * h * 0.45;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  const lvl = $("#pvLvl");
  lvl.style.width = Math.min(100, peak * 100) + "%";
  lvl.parentElement.classList.toggle("crit", peak >= 0.99);
  requestAnimationFrame(drawScope);
}

export function initPreview() {
  initKnobs();
  $("#pvPlay").onclick = togglePlay;
  $("#pvReload").onclick = () => Pd.audio() ? reload() : togglePlay();
  $("#pvAuto").checked = auto;
  $("#pvAuto").onchange = e => { auto = e.target.checked; store.set("lich-pd-auto", auto ? "1" : "0"); };
  $("#pvVol").oninput = e => Pd.setVolume(+e.target.value);
  $("#pvInput").onchange = async e => {
    const v = e.target.value;
    if (v === "file") { $("#pvFile").click(); return; }
    $("#pvFileName").textContent = "";
    if (!Pd.audio()) return;
    try { await Pd.setInput(v); } catch (err) {
      if (e.target.value !== v) return;
      toast(v === "mic" ? "Microphone blocked: " + err.message : err.message, "err", 5000);
      e.target.value = "none"; await Pd.setInput("none");
    }
  };
  $("#pvFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) { $("#pvInput").value = Pd.inputSource(); return; }
    try {
      if (!Pd.audio()) await togglePlay();
      await Pd.setInput("file", f);
      $("#pvFileName").textContent = f.name;
      $("#pvInput").value = "file";
    } catch (err) { toast("Couldn't play " + f.name + ": " + err.message, "err", 5000); }
  };
  on("ed:changed", soft => {
    binds = bindings(E.model);
    const s = JSON.stringify(binds);
    if (s !== sig) { sig = s; renderControls(); }
    scheduleReload(soft);
  });
  // a new patch starts from its own defaults (ed:loaded fires after the first ed:changed)
  on("ed:loaded", () => { knob.clear(); outs.clear(); binds = bindings(E.model); sig = JSON.stringify(binds); renderControls(); });
  on("pd:float", ({ receiver, value }) => { if (receiver.startsWith("__")) return; outs.set(receiver, value); renderOuts(); });
  const NOISE = /(is|has been) deprecated/;   // cyclone's own startup warnings
  on("pd:print", text => { if (!NOISE.test(text)) say(text, /^(error|verbose\(0\))|couldn't|bad|no such/i.test(text) ? "err" : "print"); });
  on("pd:state", setStatus);
  on("tab", t => { if (t === "editor" && Pd.isRunning()) drawScope(); });
  binds = bindings(E.model); renderControls(); setStatus();
}
