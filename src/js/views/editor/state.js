// Editor state, history and change notification shared by the editor pieces.
import { emit } from "../../state.js";
import { parse, serialize, emptyPatch } from "../../pd/model.js";
import { store } from "../../util.js";

export const E = {
  model: emptyPatch(),
  path: [],             // node indices from the root canvas down to the open subpatch
  sel: new Set(),       // selected node indices in the open canvas
  selConn: null,        // selected connection index
  mode: "edit",         // edit | play
  zoom: 1,
  name: "Pd Patch",
  undo: [], redo: [],
  values: new Map(),    // node key → last value seen in the preview
  issues: [],
  help: null,           // help patch file name when the page was opened with ?help=
  extraFiles: [],       // abstractions the preview needs next to main.pd (help patches' helpers)
};

export const canvas = () => E.path.reduce((c, i) => c.nodes[i].canvas, E.model.root);
export const pathKey = () => ["0", ...E.path].join("-");
export const nodeKey = i => `${pathKey()}_${i}`;

const snapshot = () => JSON.stringify({ pd: serialize(E.model), path: E.path });
function restore(s) {
  const { pd, path } = JSON.parse(s);
  E.model = parse(pd);
  // the open subpatch may not exist any more
  E.path = [];
  for (const i of path) { const n = canvas().nodes[i]; if (n?.kind !== "sub") break; E.path.push(i); }
  E.sel.clear(); E.selConn = null;
}

/** Run a mutation as one undoable step. */
export function change(fn, { soft = false } = {}) {
  E.undo.push(snapshot());
  if (E.undo.length > 200) E.undo.shift();
  E.redo = [];
  fn();
  changed(soft);
}
/** Record a pre-change snapshot taken earlier (drags). */
export function pushUndo(s) { E.undo.push(s); E.redo = []; }
export const takeSnapshot = snapshot;

export function undo() { if (!E.undo.length) return; E.redo.push(snapshot()); restore(E.undo.pop()); changed(); }
export function redo() { if (!E.redo.length) return; E.undo.push(snapshot()); restore(E.redo.pop()); changed(); }

let saveT;
/** soft: geometry only (moves) – no need to reload the preview */
export function changed(soft = false) {
  emit("ed:render");
  emit("ed:changed", soft);
  clearTimeout(saveT);
  if (E.help) return;   // a help patch is a scratch copy: never overwrite the user's draft
  saveT = setTimeout(() => store.set("lich-pd-draft", JSON.stringify({ name: E.name, pd: serialize(E.model) })), 400);
}

export function loadText(text, name) {
  E.model = parse(text);
  E.path = []; E.sel.clear(); E.selConn = null; E.undo = []; E.redo = []; E.values.clear();
  if (name) E.name = name;
  changed();
  emit("ed:loaded");
}
