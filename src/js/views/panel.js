// Virtual Lich panel: knobs, 7-segment display, encoder, buttons, USB LED, fit-to-screen.
import { S, on } from "../state.js";
import { SEG_BITS, SEG } from "../protocol.js";
import { $, $$ } from "../util.js";
import { loadSlot, press } from "../device.js";

const KNOB_RANGE = 300;   // degrees of travel

function buildKnob(el) {
  const big = el.classList.contains("big"), r = 50, sw = big ? 2.2 : 2.6;
  const pt = a => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = pt(-KNOB_RANGE / 2), [x1, y1] = pt(KNOB_RANGE / 2), dr = big ? 3.2 : 5;
  el.innerHTML = `<svg class="arc" viewBox="0 0 100 100">
      <path d="M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1}" fill="none" stroke="#e9e9e6" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>
      <path class="lvl" d="" fill="none" stroke="#e2342b" stroke-width="${sw + 1.6}" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity=".9"/>
      <circle cx="${x0}" cy="${y0}" r="${dr}" fill="#e9e9e6"/><circle cx="${x1}" cy="${y1}" r="${dr}" fill="#e9e9e6"/></svg>
    <div class="cap">${el.classList.contains("sm") || el.classList.contains("tr") ? '<i class="dot"></i>' : '<i class="ind"></i>'}</div><span class="val"></span>`;
  el._pt = pt; el._r = r;
}

function renderKnob(el) {
  const v = S.params.get(+el.dataset.pid)?.value;
  const a = v == null ? 0 : -KNOB_RANGE / 2 + KNOB_RANGE * v / 127;
  const ind = el.querySelector(".ind"), dot = el.querySelector(".dot");
  if (ind) ind.style.transform = `rotate(${el.classList.contains("mid") ? a - 90 : a}deg)`;
  if (dot) dot.style.transform = `rotate(${a}deg) translateY(-17px)`;
  const lvl = el.querySelector(".lvl");
  if (v == null) lvl.setAttribute("d", "");
  else {
    const [x0, y0] = el._pt(-KNOB_RANGE / 2), [x1, y1] = el._pt(a);
    lvl.setAttribute("d", `M${x0} ${y0} A${el._r} ${el._r} 0 ${a + KNOB_RANGE / 2 > 180 ? 1 : 0} 1 ${x1} ${y1}`);
  }
  el.querySelector(".val").textContent = v ?? "";
}
const renderKnobs = () => $$(".module .knob[data-pid]").forEach(renderKnob);

/* 7-segment: same bits and rules as Lich3/Core/Src/Lich.cpp */
function buildSeg() {
  const k = 0.18;  // italic skew
  const P = pts => pts.map(([x, y]) => `${x + (52 - y) * k},${y}`).join(" ");
  const h = (x, y, w) => P([[x, y], [x + 2.5, y - 2.5], [x + w - 2.5, y - 2.5], [x + w, y], [x + w - 2.5, y + 2.5], [x + 2.5, y + 2.5]]);
  const v = (x, y, l) => P([[x, y], [x + 2.5, y + 2.5], [x + 2.5, y + l - 2.5], [x, y + l], [x - 2.5, y + l - 2.5], [x - 2.5, y + 2.5]]);
  const segs = [h(5, 3, 22), v(28, 4, 21), v(28, 27, 21), h(5, 49, 22), v(4, 27, 21), v(4, 4, 21), h(5, 26, 22)];
  $("#seg").innerHTML = segs.map((p, i) => `<polygon class="s" data-i="${i}" points="${p}"/>`).join("") + `<circle class="s" data-i="7" cx="38" cy="48.5" r="2.6"/>`;
}
function setSeg(v, dot) {
  const bits = SEG_BITS[v % SEG_BITS.length];
  $$("#seg .s").forEach(s => { const i = +s.dataset.i; s.classList.toggle("on", i === 7 ? dot : !!(bits & (1 << i))); });
}
let blink = false;
function renderSeg() {
  if (!S.out) return setSeg(SEG.BLANK, false);
  if (S.mode === "load") return setSeg(SEG.L, blink);
  if (S.mode === "error") return setSeg(SEG.E, blink);
  if (S.prog == null) return setSeg(SEG.L, true);
  const sel = S.sel ?? S.prog;
  setSeg(sel % 16, sel === S.prog);
}

function initEncoder() {
  const enc = $("#enc");
  let angle = 0, reset;
  enc.addEventListener("wheel", e => {
    e.preventDefault();
    if (!S.out || S.prog == null) return;
    const slots = [...S.patches.keys()].filter(i => i > 0).sort((a, b) => a - b);
    if (!slots.length) return;
    let i = slots.indexOf(S.sel); if (i < 0) i = 0;
    i = Math.max(0, Math.min(slots.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
    S.sel = slots[i];
    angle += e.deltaY > 0 ? 18 : -18;
    enc.style.transform = `rotate(${angle}deg)`;
    renderSeg();
    const p = S.patches.get(S.sel);
    enc.title = p ? `Slot ${S.sel}: ${p.name}. Click to load` : "";
    clearTimeout(reset);
    reset = setTimeout(() => { S.sel = S.prog; renderSeg(); }, 4000);   // like PATCH_RESET_COUNTER
  }, { passive: false });
  enc.addEventListener("click", () => {
    if (S.out && S.sel > 0 && S.sel !== S.prog) { clearTimeout(reset); loadSlot(S.sel); }
  });
}

export function initButtons() {
  $$(".pbtn[data-bid]").forEach(b => {
    const bid = +b.dataset.bid;
    b.addEventListener("pointerdown", e => { b.setPointerCapture(e.pointerId); press(bid, true); });
    b.addEventListener("pointerup", () => press(bid, false));
    b.addEventListener("pointercancel", () => press(bid, false));
  });
}
const renderButtons = () => $$(".pbtn[data-bid]").forEach(b => b.classList.toggle("on", !!S.buttons[b.dataset.bid]));

/* Scale the panel to the viewport height (or width on phones) so it never needs scrolling */
function fit() {
  const m = $("#module"), wrap = $("#moduleWrap");
  m.style.zoom = 1;
  const h = m.offsetHeight, w = m.offsetWidth;
  const stacked = innerWidth <= 820;
  const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 16;
  const z = stacked ? Math.min(1, (innerWidth - 32) / w) : Math.min(1, Math.max(0.55, (innerHeight - pad * 2) / h));
  m.style.zoom = z;
  wrap.style.width = Math.ceil(w * z) + "px";
}

function setLed() { $("#usbLed").className = "led" + (S.out ? (S.busy ? " busy" : " on") : ""); }

export function initPanel() {
  $$(".module .knob").forEach(buildKnob);
  buildSeg(); initEncoder(); initButtons();
  renderKnobs(); renderSeg(); renderButtons(); setLed();
  setInterval(() => { blink = !blink; if (S.mode !== "run") renderSeg(); }, 450);
  on("param", pid => { if (pid < 4) renderKnobs(); });
  on("params", renderKnobs);
  on("seg", renderSeg);
  on("buttons", renderButtons);
  on("busy", setLed);
  on("conn", () => { setLed(); renderSeg(); });
  addEventListener("resize", fit);
  // the panel is hidden on the editor tab, where it measures 0×0: refit once it is visible again
  on("tab", () => requestAnimationFrame(fit));
  fit();
  document.fonts?.ready.then(fit);
}
