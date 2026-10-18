// Right-hand column: object palette and the inspector (selection details, OWL binding form,
// patch overview with bindings and Heavy problems).
import { on, emit } from "../../state.js";
import { $, esc } from "../../util.js";
import { classOf } from "../../pd/model.js";
import { PALETTE, heavyOk, ports } from "../../pd/objects.js";
import { owlBinding, bindings, OWL_KEYS, OWL_BUTTONS } from "../../pd/owl.js";
import { docFor, loadDocs, helpPageUrl, helpSourceUrl, HVCC_DOCS } from "../../pd/docs.js";
import { E, canvas, change } from "./state.js";
import { place, startEdit, openSub, upTo, reveal } from "./canvas.js";

const HINT = new Map(PALETTE.flatMap(([, items]) => items.map(([t, h]) => [t.split(" ")[0], h])));

function renderPalette() {
  const q = $("#edSearch").value.trim().toLowerCase();
  $("#edPalette").innerHTML = PALETTE.map(([group, items]) => {
    const hits = items.filter(([t, h]) => !q || t.toLowerCase().includes(q) || h.toLowerCase().includes(q));
    if (!hits.length) return "";
    return `<div class="pg"><div class="pgt">${esc(group)}</div>${hits.map(([t, h]) => {
      const sum = docFor(t.split(" ")[0])?.summary;
      return `<button class="pi" draggable="true" data-t="${esc(t)}" title="${esc(sum || h)} · click or drag onto the canvas"><b>${esc(t.split(" @")[0])}</b><span>${esc(h)}</span></button>`;
    }).join("")}</div>`;
  }).join("") || `<div class="faint pe">No match. Double-click the canvas and type any Heavy object.</div>`;
}

/* ───────── inspector ───────── */
function bindingForm(n) {
  const cls = classOf(n), b = owlBinding(n) || { name: n.atoms[1] || "", key: "", min: 0, max: 1, def: null };
  const dir = cls[0] === "r" ? "in" : "out";
  const keys = [...OWL_KEYS, ...OWL_BUTTONS];
  return `<div class="ins-form" data-cls="${esc(cls)}">
    <label>Name <input id="ibName" value="${esc(b.name)}" spellcheck="false"></label>
    <label>OWL ${dir === "in" ? "input" : "output"} <select id="ibKey"><option value="">— none —</option>${keys.map(k =>
      `<option ${k === b.key ? "selected" : ""}>${k}</option>`).join("")}</select></label>
    <div class="ins-row"><label>Min <input id="ibMin" type="number" step="any" value="${b.min}"></label>
      <label>Max <input id="ibMax" type="number" step="any" value="${b.max}"></label>
      ${dir === "in" ? `<label>Default <input id="ibDef" type="number" step="any" value="${b.def ?? ""}" placeholder="–"></label>` : ""}</div>
    <p class="note">${dir === "in"
      ? "The Lich sends 0..1 from the knob, CV or button; Heavy rescales it to min..max before it reaches this receive."
      : "Values in min..max are scaled to 0..1 and written to this parameter; F and G drive the CV outputs."}</p>
  </div>`;
}

function applyBinding() {
  const i = [...E.sel][0], n = canvas().nodes[i], cls = classOf(n);
  const name = $("#ibName").value.trim().replace(/\s+/g, "_") || "x", key = $("#ibKey").value;
  const min = $("#ibMin").value || "0", max = $("#ibMax").value || "1", def = $("#ibDef")?.value ?? "";
  const atoms = [cls, name];
  if (key) atoms.push("@raw", key, String(+min), String(+max), ...(def !== "" ? [String(+def)] : []));
  change(() => { n.atoms = atoms; });
}

// "[s~ mixxx+]" for a problem, so identical messages can be told apart
function nodeLabel(is) {
  let cv = E.model.root;
  for (const j of is.path.split("-").slice(1)) cv = cv.nodes[+j].canvas;
  const n = cv.nodes[is.index];
  return n ? `[${n.atoms.join(" ")}]` : "";
}

function overview() {
  const bs = bindings(E.model);
  const rows = bs.map(b => `<tr><td class="k">${esc(b.key)}</td><td>${esc(b.name)}</td><td class="faint">${b.dir === "in" ? "in" : "out"} ${b.min}…${b.max}</td></tr>`).join("");
  const probs = E.issues.map((is, k) => `<li data-k="${k}" title="${is.index >= 0 ? "Show this box" : ""}">${esc(is.message)}${is.index >= 0 ? ` <span class="faint mono">${esc(nodeLabel(is))}</span>` : ""}</li>`).join("");
  let objects = 0;
  const count = cv => cv.nodes.forEach(n => { objects++; if (n.kind === "sub") count(n.canvas); });
  count(E.model.root);
  return `<div class="ins-h">Patch</div>
    <dl class="kv sm"><dt>Objects</dt><dd>${objects}</dd><dt>Heavy</dt><dd>${E.issues.length ? `<span class="tag red">${E.issues.length} problem${E.issues.length > 1 ? "s" : ""}</span>` : '<span class="tag ok">compatible</span>'}</dd></dl>
    ${probs ? `<ul class="probs">${probs}</ul>` : ""}
    <div class="ins-h">Lich controls</div>
    ${rows ? `<table class="binds">${rows}</table>` : `<p class="note">No <code>@raw</code> receives yet. Add <code>[r Name @raw A]</code> to read knob A.</p>`}`;
}

function renderInspector() {
  const el = $("#edInspector"), cv = canvas();
  if (E.selConn != null) {
    const c = cv.conns[E.selConn];
    el.innerHTML = `<div class="ins-h">Connection</div><p class="muted">${c ? `object ${c.from} outlet ${c.outlet} → object ${c.to} inlet ${c.inlet}` : ""}</p><p class="note">Delete or Backspace removes it.</p>`;
    return;
  }
  if (E.sel.size !== 1) { el.innerHTML = (E.sel.size > 1 ? `<div class="ins-h">${E.sel.size} selected</div><p class="note">Drag to move, ⌘D duplicates, Delete removes.</p>` : "") + overview(); bindProblems(); return; }
  const i = [...E.sel][0], n = cv.nodes[i], cls = classOf(n);
  const p = ports(n);
  const kind = n.kind === "obj" ? cls || "empty object" : n.kind === "sub" ? "subpatch" : n.kind;
  const ok = n.kind !== "obj" || !cls || heavyOk(cls);
  const issue = E.issues.find(is => is.path === ["0", ...E.path].join("-") && is.index === i);
  el.innerHTML = `<div class="ins-h">${esc(kind)} ${n.kind === "obj" && cls ? (ok ? '<span class="tag ok">heavy</span>' : '<span class="tag red">not in heavy</span>') : ""}</div>
    ${HINT.get(cls) ? `<p class="muted">${esc(HINT.get(cls))}</p>` : ""}
    ${issue ? `<div class="notice err sm">${esc(issue.message)}</div>` : ""}
    <p class="faint mono">${p.ins.length} in · ${p.outs.length} out · x ${n.x} y ${n.y}</p>
    ${["r", "receive", "s", "send"].includes(cls) ? bindingForm(n) : ""}
    <div class="actions">
      ${["obj", "msg", "text", "sub"].includes(n.kind) ? '<button class="btn sm" id="ibEdit">Edit text</button>' : ""}
      ${n.kind === "sub" ? '<button class="btn sm" id="ibOpen">Open</button>' : ""}
    </div>
    ${n.kind === "obj" && cls ? docsHtml(cls) : ""}`;
  $("#ibEdit")?.addEventListener("click", () => startEdit(i));
  $("#ibOpen")?.addEventListener("click", () => openSub(i));
  for (const id of ["#ibName", "#ibKey", "#ibMin", "#ibMax", "#ibDef"]) $(id)?.addEventListener("change", applyBinding);
}

/* ───────── object docs ───────── */
const SECTIONS = [["INLETS", "Inlets"], ["OUTLETS", "Outlets"], ["ARGUMENTS", "Arguments"], ["FLAGS", "Flags"], ["MESSAGES", "Messages"]];

function docsHtml(cls) {
  const d = docFor(cls);
  if (!d) return heavyOk(cls) ? `<div class="docs"><p class="faint">Loading docs…</p></div>` : "";
  const sec = SECTIONS.filter(([k]) => d[k]?.length).map(([k, title]) =>
    `<details class="ds"${k === "INLETS" || k === "OUTLETS" ? " open" : ""}><summary>${title}</summary>${d[k].map(b =>
      `<div class="db">${b.label ? `<i>${esc(b.label)}</i>` : ""}<ul>${b.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("")}</details>`).join("");
  const links = [
    d.help && `<a href="${helpPageUrl(d.help)}" target="_blank" rel="noopener" title="Open Pd's help patch for [${esc(cls)}] in a new tab, playable">Help patch ↗</a>`,
    d.help && `<a href="${helpSourceUrl(d.help)}" target="_blank" rel="noopener">Source</a>`,
    d.link && `<a href="${d.link}" target="_blank" rel="noopener">Library docs ↗</a>`,
    `<a href="${HVCC_DOCS}" target="_blank" rel="noopener" title="hvcc's list of supported objects and their limits">Heavy notes ↗</a>`,
  ].filter(Boolean).join(" · ");
  return `<div class="docs">
    <div class="ins-h">Docs${d.alias ? ` <span class="faint">(${esc(d.alias)})</span>` : ""}</div>
    ${d.summary ? `<p class="dsum">${esc(d.summary)}</p>` : ""}
    ${d.heavy ? `<p class="dheavy" title="From hvcc's supported-objects table"><b>On the Lich:</b> ${esc(d.heavy)}</p>` : ""}
    ${sec}
    <p class="dlinks">${links}</p>
  </div>`;
}

/** Open the subpatch holding problem k, select its box and scroll to it. */
export function showIssue(k) {
  const is = E.issues[k];
  if (!is || is.index < 0) return;
  const path = is.path.split("-").slice(1).map(Number);
  upTo(0);
  for (const j of path) openSub(j);
  E.sel = new Set([is.index]);
  emit("ed:render"); emit("ed:select");
  reveal(is.index);
}

function bindProblems() {
  document.querySelectorAll("#edInspector .probs li").forEach(li => li.onclick = () => showIssue(+li.dataset.k));
}

function renderCrumbs() {
  const names = ["main"];
  let cv = E.model.root;
  for (const i of E.path) { const n = cv.nodes[i]; names.push(n.atoms.slice(1).join(" ") || "subpatch"); cv = n.canvas; }
  $("#edCrumbs").innerHTML = names.map((nm, d) => d === names.length - 1 ? `<b>${esc(nm)}</b>` : `<a data-d="${d}">${esc(nm)}</a> ›`).join(" ");
  $("#edCrumbs").classList.toggle("hidden", !E.path.length);
}

export function initSide() {
  renderPalette();
  $("#edSearch").addEventListener("input", renderPalette);
  $("#edSearch").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const first = $("#edPalette .pi");
    if (first) { place("obj", first.dataset.t); $("#edSearch").value = ""; renderPalette(); }
  });
  $("#edPalette").addEventListener("click", e => { const b = e.target.closest(".pi"); if (b) place("obj", b.dataset.t); });
  $("#edPalette").addEventListener("dragstart", e => {
    const b = e.target.closest(".pi");
    if (b) { e.dataTransfer.setData("text/x-pd-object", b.dataset.t); e.dataTransfer.effectAllowed = "copy"; }
  });
  $("#edCrumbs").addEventListener("click", e => { const a = e.target.closest("a"); if (a) upTo(+a.dataset.d); });
  on("ed:select", renderInspector);
  on("ed:changed", renderInspector);
  on("ed:path", renderCrumbs);
  on("ed:loaded", () => { renderCrumbs(); renderInspector(); });
  on("docs", () => { renderPalette(); renderInspector(); });
  on("tab", t => { if (t === "editor") loadDocs(); });
  renderCrumbs(); renderInspector();
}
