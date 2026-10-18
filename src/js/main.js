// Entry point: wires the header, tabs and views together.
import "../styles/main.css";
import { S, on, emit } from "./state.js";
import { $, $$, esc, store } from "./util.js";
import { connect, autoAttach, attach, NO_MIDI } from "./midi.js";
import "./device.js";
import { initPanel } from "./views/panel.js";
import { initPatches } from "./views/patches.js";
import { initLibrary } from "./views/library.js";
import { initControl, allNotesOff } from "./views/control.js";
import { initDevice } from "./views/device.js";
import { initMonitor } from "./views/monitor.js";
import { initEditor } from "./views/editor/index.js";

/* Tabs have their own URLs: /patches, /editor, … (netlify.toml rewrites them to index.html).
   Switching pushes a history entry, so Back/Forward move between tabs. */
const BASE = import.meta.env.BASE_URL;
const tabFromPath = () => {
  const t = location.pathname.slice(BASE.length).replace(/\/+$/, "");
  return $("#v-" + t) && $(`nav.tabs .tab[data-tab="${t}"]`) ? t : null;
};
function showTab(t) {
  $$("nav.tabs .tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + t));
  store.set("lich-tab", t);
  // keep ?help=… while staying on the editor; a different tab gets a clean URL
  if (location.pathname !== BASE + t) history.pushState({ tab: t }, "", BASE + t);
}
on("tab", showTab);
$$("nav.tabs .tab").forEach(b => b.onclick = () => emit("tab", b.dataset.tab));
addEventListener("popstate", () => { const t = tabFromPath(); if (t) emit("tab", t); });

/* header: connection */
function renderConn() {
  const up = !!S.out;
  $("#connDot").className = "dot" + (up ? (S.busy ? " busy" : " on") : "");
  $("#connText").textContent = up ? (S.fw || S.out.name) : "Not connected";
  $("#connectBtn").textContent = up ? "Reconnect" : "Connect";
}
function renderPorts() {
  const sel = $("#portSel"), outs = S.access ? [...S.access.outputs.values()] : [];
  sel.innerHTML = outs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");
  if (S.out) sel.value = S.out.id;
  // only worth showing when there is a real choice to make
  sel.classList.toggle("hidden", outs.length < 2 || (!!S.out && outs.filter(o => /owl|lich/i.test(o.name)).length < 2));
}
on("conn", () => { renderConn(); renderPorts(); });
on("busy", renderConn);
on("device", renderConn);
on("ports", renderPorts);
on("nomidi", msg => { const n = $("#noMidi"); n.textContent = msg; n.classList.remove("hidden"); });
$("#connectBtn").onclick = () => {
  if (!S.access) connect();
  else if (S.out) emit("conn", true);     // re-read everything
  else autoAttach(true);
};
$("#portSel").onchange = e => { const o = S.access.outputs.get(e.target.value); if (o) attach(o); };
addEventListener("beforeunload", allNotesOff);

initPanel(); initPatches(); initLibrary(); initControl(); initDevice(); initMonitor(); initEditor();
renderConn();
// the URL wins; "/" falls back to the last tab used, then Patches
{
  const stored = store.get("lich-tab");
  const t = tabFromPath() ?? (stored && $("#v-" + stored) ? stored : "patches");
  if (location.pathname !== BASE + t) history.replaceState({ tab: t }, "", BASE + t + location.search);
  emit("tab", t);
}

/* reconnect silently if MIDI was granted before */
if (!navigator.requestMIDIAccess) emit("nomidi", NO_MIDI);
else navigator.permissions?.query({ name: "midi", sysex: true }).then(p => { if (p.state === "granted") connect(); }).catch(() => {});
