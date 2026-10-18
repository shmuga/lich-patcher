// Monitor tab: decoded MIDI log, throttled rendering.
import { LOG, on } from "../state.js";
import { describe } from "../protocol.js";
import { $, esc } from "../util.js";

let dirty = false;
const visible = () => $("#v-monitor").classList.contains("on");
const hexOf = x => Array.from(x.m, b => b.toString(16).padStart(2, "0")).join(" ") + (x.len > 64 ? " …" : "");
const time = t => t.toLocaleTimeString([], { hour12: false }) + "." + String(t.getMilliseconds()).padStart(3, "0");

function render() {
  if (!dirty || !visible()) return;
  dirty = false;
  const hide = $("#hidePoll").checked, hex = $("#showHex").checked, el = $("#log");
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  el.innerHTML = LOG.filter(x => !(hide && x.poll)).slice(-400).map(x =>
    `<div><span class="t">${time(x.t)}</span><span class="${x.dir}">${x.dir === "in" ? "◀" : "▶"}</span><span>${esc(describe(x.m))}</span>${hex ? `<span class="hex">${hexOf(x)}</span>` : ""}</div>`).join("");
  if (stick) el.scrollTop = el.scrollHeight;
}

export function initMonitor() {
  setInterval(render, 250);
  on("log", () => dirty = true);
  on("tab", t => { if (t === "monitor") { dirty = true; $("#errBadge").classList.add("hidden"); } });
  on("error", () => { if (!visible()) $("#errBadge").classList.remove("hidden"); });
  $("#hidePoll").onchange = $("#showHex").onchange = () => dirty = true;
  $("#clearLog").onclick = () => { LOG.length = 0; dirty = true; };
}
