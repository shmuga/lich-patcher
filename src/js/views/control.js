// Control tab: parameters, keyboard, patch messages. (Gate buttons are wired in panel.js.)
import { S, on } from "../state.js";
import { PNAMES, HW_PARAMS, LICH_PARAM_NOTE, paramCC } from "../protocol.js";
import { $, esc, toast } from "../util.js";
import { send, sendCC } from "../midi.js";
import { setParam, loadSlot } from "../device.js";

function renderParams() {
  const ids = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
  S.params.forEach((p, id) => { if (p.name) ids.add(id); });
  $("#params").innerHTML = [...ids].sort((a, b) => a - b).map(id => {
    const p = S.params.get(id) || {};
    const out = /\>\s*$/.test(p.name || "");     // OWL convention: output parameters end with ">"
    const hw = id < HW_PARAMS;
    const label = p.name ? esc(p.name) : `<span class="faint">${LICH_PARAM_NOTE[id] || "unnamed"}</span>`;
    const tip = hw ? "Set by the knob and CV on the module" : out ? "Output from the patch" : "";
    return `<div class="param ${hw ? "hw" : ""}" data-pid="${id}" title="${tip}"><div class="row"><span class="pid">${PNAMES[id]}</span><span class="pname">${label}</span>
      ${hw ? '<span class="tag">knob</span>' : out ? '<span class="tag">out</span>' : ""}<span class="pval">${p.value ?? "–"}</span></div>
      <input type="range" min="0" max="127" value="${p.value ?? 0}" ${hw || out || !S.out ? "disabled" : ""}></div>`;
  }).join("");
  const cur = S.patches.get(S.prog);
  $("#ctlPatch").textContent = cur ? `${S.prog === 0 ? "RAM" : "slot " + S.prog} · ${cur.name}` : "";
}
function renderParam(pid) {
  const el = $(`#params [data-pid="${pid}"]`);
  if (!el) return;
  const v = S.params.get(pid)?.value;
  if (document.activeElement !== el.querySelector("input")) el.querySelector("input").value = v ?? 0;
  el.querySelector(".pval").textContent = v ?? "–";
}

/* keyboard */
let octave = 3;
const held = new Map();
const KEYMAP = "awsedftgyhujk";
function buildKeys() {
  const k = $("#keys"), names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  k.innerHTML = "";
  let white = 0;
  for (let n = 0; n < 25; n++) {
    const note = (octave + 1) * 12 + n, black = names[n % 12].includes("#");
    const b = document.createElement("button");
    b.className = "key" + (black ? " black" : "");
    b.dataset.note = note;
    if (black) b.style.left = `calc(8px + ${white} * (100% - 16px) / 15)`;
    else { b.textContent = n % 12 === 0 ? "C" + (octave + n / 12) : ""; white++; }
    k.append(b);
  }
  $("#octLbl").textContent = "C" + octave;
}
const noteCh = () => (+$("#noteCh").value || 1) - 1;
function noteOn(n) {
  if (held.has(n) || !S.out) return;
  held.set(n, noteCh());
  send([0x90 | noteCh(), n, 100], true);
  $(`.key[data-note="${n}"]`)?.classList.add("on");
}
function noteOff(n) {
  if (!held.has(n)) return;
  send([0x80 | held.get(n), n, 0], true);
  held.delete(n);
  $(`.key[data-note="${n}"]`)?.classList.remove("on");
}
export const allNotesOff = () => [...held.keys()].forEach(noteOff);
const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);

export function initControl() {
  $("#params").addEventListener("input", e => {
    const pid = +e.target.closest(".param").dataset.pid, v = +e.target.value;
    sendCC(paramCC(pid), v, true);
    setParam(pid, v);
  });
  $("#namesBtn").onclick = () => {
    if (!S.out) return toast("Not connected", "warn");
    if (!(S.prog > 0)) return toast("Only stored patches can be restarted", "warn");
    S.params.forEach(p => p.name = null);
    loadSlot(S.prog);
    toast("Restarting patch to read its parameter names…");
  };

  $("#noteCh").innerHTML = Array.from({ length: 16 }, (_, i) => `<option>${i + 1}</option>`).join("");
  buildKeys();
  $("#keys").addEventListener("pointerdown", e => {
    const k = e.target.closest(".key");
    if (!k) return;
    const n = +k.dataset.note;
    noteOn(n);
    const up = () => { noteOff(n); removeEventListener("pointerup", up); };
    addEventListener("pointerup", up);
  });
  addEventListener("keydown", e => {
    if (e.repeat || e.metaKey || e.ctrlKey || typing() || !$("#v-control").classList.contains("on")) return;
    const i = KEYMAP.indexOf(e.key.toLowerCase());
    if (i >= 0) noteOn((octave + 1) * 12 + i);
  });
  addEventListener("keyup", e => { const i = KEYMAP.indexOf(e.key.toLowerCase()); if (i >= 0) noteOff((octave + 1) * 12 + i); });
  $("#octDn").onclick = () => { allNotesOff(); octave = Math.max(-1, octave - 1); buildKeys(); };
  $("#octUp").onclick = () => { allNotesOff(); octave = Math.min(7, octave + 1); buildKeys(); };

  on("params", renderParams);
  on("patches", renderParams);
  on("conn", renderParams);
  on("param", renderParam);
  on("msg", () => $("#patchMsg").textContent = S.msg);
  renderParams();
}
