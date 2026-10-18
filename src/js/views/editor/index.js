// Pd editor tab: toolbar, files, templates, console and wiring of the editor pieces.
import { on, emit } from "../../state.js";
import { $, esc, toast, confirmBox, saveFile, safeName, store } from "../../util.js";
import { serialize } from "../../pd/model.js";
import { lint, cleanName } from "../../pd/owl.js";
import { TEMPLATES } from "../../pd/templates.js";
import { E, loadText, undo, redo } from "./state.js";
import { initCanvas, render, setMode, setZoom } from "./canvas.js";
import { initSide, showIssue } from "./side.js";
import { initPreview } from "./preview.js";
import { initBuild } from "./build.js";
import { loadDocs, docsMeta, isHelpFile } from "../../pd/docs.js";

let saved = "";   // serialized text at last open/save, for the unsaved-changes guard
const dirty = () => serialize(E.model) !== saved;

/* ───────── console ───────── */
// Batched: a patch can print every audio block, so lines are queued and drawn once per frame,
// and a line repeating the previous one only bumps a counter.
const lines = [];
let drawQueued = false;
function consoleAdd({ kind = "print", text }) {
  for (const t of String(text).split("\n")) {
    const prev = lines.at(-1);
    if (prev && prev.text === t && prev.kind === kind) { prev.n++; prev.at = new Date(); continue; }
    lines.push({ kind, text: t, at: new Date(), n: 1 });
  }
  if (lines.length > 400) lines.splice(0, lines.length - 400);
  if (!drawQueued) { drawQueued = true; requestAnimationFrame(drawConsole); }
}
function drawConsole() {
  drawQueued = false;
  const el = $("#edConsole");
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  el.innerHTML = lines.map(l => `<div class="${l.kind}"><span class="t">${l.at.toTimeString().slice(0, 8)}</span>${esc(l.text)}${l.n > 1 ? ` <b class="rep">×${l.n}</b>` : ""}</div>`).join("");
  if (stick) el.scrollTop = el.scrollHeight;
}

/* ───────── files ───────── */
async function guard() {
  return !dirty() || confirmBox("Discard changes?", `"${E.name}" has changes that aren't saved to a .pd file. They stay in this browser's draft until you open something else.`, "Discard");
}
function open(text, name) {
  try { loadText(text, cleanName(name)); }
  catch (e) { toast(e.message, "err", 5000); return false; }
  saved = serialize(E.model);
  $("#edName").value = E.name;
  return true;
}
function saveAs() {
  const text = serialize(E.model);
  saveFile(new TextEncoder().encode(text), safeName(E.name) + ".pd", "text/plain");
  saved = text; renderDirty();
}
const renderDirty = () => $("#edDirty").classList.toggle("on", dirty());

/* ───────── help patches (?help=osc~-help.pd, opened from the docs) ───────── */
async function openHelp(file) {
  E.help = file;
  emit("tab", "editor");
  const base = import.meta.env.BASE_URL + "help/";
  try {
    const get = async f => { const r = await fetch(base + encodeURIComponent(f)); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.text(); };
    await loadDocs();
    const helpers = docsMeta().helpers ?? [];
    const [text, ...extra] = await Promise.all([get(file), ...helpers.map(get)]);
    E.extraFiles = helpers.map((path, k) => ({ path, content: extra[k] }));
    open(text, "help " + file.replace(/-help\.pd$|\.pd$/, ""));
    saved = serialize(E.model);
    setMode("play");
    const note = $("#edHelpNote");
    note.innerHTML = `Pd ${esc(docsMeta().pd || "")} help patch <b>${esc(file)}</b>: a scratch copy, edits aren't kept. ` +
      `Press ▶ Play in Preview and click the boxes. Yellow boxes don't exist in Heavy. <a href="${location.pathname}">Back to my patch</a>`;
    note.classList.remove("hidden");
    document.title = `${file} · Lich Patcher`;
  } catch (e) {
    toast("Couldn't open help patch: " + e.message, "err", 6000);
  }
}

function renderModes() {
  $("#edModeEdit").setAttribute("aria-selected", E.mode === "edit");
  $("#edModePlay").setAttribute("aria-selected", E.mode === "play");
}

export function initEditor() {
  $("#edTpl").innerHTML = `<option value="" disabled selected>New…</option>` +
    TEMPLATES.map((t, i) => `<option value="${i}">${esc(t.name)} – ${esc(t.hint)}</option>`).join("");
  $("#edTpl").onchange = async e => {
    const t = TEMPLATES[+e.target.value]; e.target.selectedIndex = 0;
    if (t && await guard()) open(t.pd, t.name);
  };
  $("#edOpen").onclick = () => $("#edFile").click();
  $("#edFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f && await guard()) open(await f.text(), f.name.replace(/\.pd$/i, ""));
  };
  $("#edSave").onclick = saveAs;
  $("#edName").onchange = e => { E.name = cleanName(e.target.value); e.target.value = E.name; emit("ed:changed", true); };
  $("#edModeEdit").onclick = () => setMode("edit");
  $("#edModePlay").onclick = () => setMode("play");
  $("#edUndo").onclick = undo;
  $("#edRedo").onclick = redo;
  $("#edZoomIn").onclick = () => setZoom(E.zoom + 0.1);
  $("#edZoomOut").onclick = () => setZoom(E.zoom - 0.1);
  // each click steps to the next problem
  let issueK = -1;
  $("#edIssues").onclick = () => { if (E.issues.length) showIssue(issueK = (issueK + 1) % E.issues.length); };
  $("#edClear").onclick =() => { lines.length = 0; consoleAdd({ kind: "info", text: "Console cleared" }); };
  addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && $("#v-editor").classList.contains("on")) { e.preventDefault(); saveAs(); }
  });
  // .pd files dropped anywhere open in the editor (everything else goes to the Patches tab)
  document.addEventListener("drop", async e => {
    const f = e.dataTransfer?.files?.[0];
    if (!f || !/\.pd$/i.test(f.name)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    emit("tab", "editor");
    if (await guard()) open(await f.text(), f.name.replace(/\.pd$/i, ""));
  }, true);
  addEventListener("beforeunload", e => { if (!E.help && dirty() && E.undo.length) e.preventDefault(); });

  on("ed:console", consoleAdd);
  on("ed:changed", () => {
    E.issues = lint(E.model);
    $("#edIssues").textContent = E.issues.length ? `${E.issues.length} Heavy problem${E.issues.length > 1 ? "s" : ""}` : "";
    renderDirty();
    $("#edUndo").disabled = !E.undo.length; $("#edRedo").disabled = !E.redo.length;
  });
  on("ed:mode", renderModes);
  on("ed:zoom", () => $("#edZoomTxt").textContent = Math.round(E.zoom * 100) + "%");
  on("tab", t => document.body.classList.toggle("wide", t === "editor"));

  initCanvas(); initSide(); initPreview(); initBuild();

  const help = new URLSearchParams(location.search).get("help");
  if (help && isHelpFile(help)) openHelp(help);
  else {
    // restore the draft, or start from a template
    let draft = null;
    try { draft = JSON.parse(store.get("lich-pd-draft") || "null"); } catch { /* corrupt draft */ }
    if (!(draft?.pd && open(draft.pd, draft.name))) open(TEMPLATES[1].pd, TEMPLATES[1].name);
    else saved = "";   // a draft has by definition not been saved to a file
  }
  renderModes(); render(); renderDirty();
  consoleAdd({ kind: "info", text: "Double-click the canvas to add an object · ⌘E switches edit/play · ⌘1 object ⌘2 message ⌘3 number ⌘5 comment" });
}
