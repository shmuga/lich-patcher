// What a patch exposes to the Lich (@raw / legacy @owl receives and sends) and whether Heavy will accept it.
// The lint mirrors lich-patcher-server/src/pd/validate.rs closely enough to catch problems
// while editing; the server still validates everything itself.
import { classOf, eachCanvas, serialize } from "./model.js";
import { heavyOk, isNumber, EXPR_FUNCTIONS } from "./objects.js";

export const OWL_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];
for (const g of "ABCD") for (const p of "ABCDEFGH") OWL_KEYS.push(g + p);
export const OWL_BUTTONS = ["Push", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "Red", "Green"];
export const isOwlKey = k => OWL_KEYS.includes(k) || OWL_BUTTONS.includes(k);
// names end up in C strings/comments only (the server rejects @hv_*, which would make them identifiers)
const BUS = /^(?:\$\d|[!#%&'()*+\-./0-9:<=>?@A-Z[\]^_a-z{|}~])+$/;
const NAMED = new Set(["s", "send", "r", "receive", "s~", "send~", "r~", "receive~", "throw~", "catch~", "table",
  "delwrite~", "delread~", "delread4~", "vd~", "tabread", "tabread~", "tabread4~", "tabwrite", "tabwrite~", "tabosc4~", "tabplay~"]);

/** Parse `r Name @raw A 0 1 0.5` (or legacy `@owl`), `@raw_min …` and `Channel-A` into a binding, or null. */
export function owlBinding(node) {
  const cls = classOf(node);
  if (!["r", "receive", "s", "send"].includes(cls)) return null;
  const [name, ...rest0] = node.atoms.slice(1);
  if (!name) return null;
  const rest = rest0.map(a => a.replace(/^@owl/, "@raw"));
  const b = { name, dir: cls[0] === "r" ? "in" : "out", key: null, min: 0, max: 1, def: null };
  if (name.startsWith("Channel-")) b.key = name.slice(8).replace(/>$/, "");
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i], v = rest[i + 1];
    if ((a === "@raw" || a === "@raw_param") && v) {
      b.key = v; i++;
      const nums = [];
      while (isNumber(rest[i + 1] ?? "")) nums.push(+rest[++i]);
      if (nums.length >= 1) b.min = nums[0];
      if (nums.length >= 2) b.max = nums[1];
      if (nums.length >= 3) b.def = nums[2];
    } else if (a === "@raw_min" && isNumber(v ?? "")) { b.min = +v; i++; }
    else if (a === "@raw_max" && isNumber(v ?? "")) { b.max = +v; i++; }
    else if (a === "@raw_default" && isNumber(v ?? "")) { b.def = +v; i++; }
  }
  if (!b.key) return null;
  b.button = OWL_BUTTONS.includes(b.key);
  return b;
}

/** Same rules as the server's check_expr: hvcc pastes control expr text into C. */
export function exprProblem(text) {
  const s = text.trim();
  if (!s) return "needs an expression";
  let depth = 0;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === " ") { i++; continue; }
    if (c === "(") { depth++; i++; continue; }
    if (c === ")") { if (--depth < 0) return "has an unmatched )"; i++; continue; }
    if ("+-*/%<>=!&|^~,".includes(c)) { i++; continue; }   // "," is Pd's \, between arguments
    if (c === "$") {
      const m = /^\$[fiv](\d+)/.exec(s.slice(i));
      if (!m || +m[1] < 1 || +m[1] > 99) return "has a bad $ inlet (use $f1, $i1 or $v1)";
      i += m[0].length; continue;
    }
    if (/[0-9.]/.test(c)) { const m = /^[0-9.]+/.exec(s.slice(i)); if (isNaN(+m[0])) return `has a bad number ${m[0]}`; i += m[0].length; continue; }
    if (/[a-z]/.test(c)) {
      const m = /^[a-z][a-z0-9_]*/.exec(s.slice(i));
      if (!EXPR_FUNCTIONS.has(m[0]) || !/^\s*\(/.test(s.slice(i + m[0].length))) return `uses "${m[0]}", which Heavy's expr doesn't know`;
      i += m[0].length; continue;
    }
    return `can't contain "${c}"`;
  }
  return depth ? "has unbalanced parentheses" : null;
}

/** All bindings in the patch, inputs first in OWL order. */
export function bindings(model) {
  const out = [];
  eachCanvas(model, cv => cv.nodes.forEach(n => { const b = owlBinding(n); if (b) out.push(b); }));
  const order = k => OWL_BUTTONS.includes(k) ? 100 + OWL_BUTTONS.indexOf(k) : OWL_KEYS.indexOf(k);
  return out.sort((a, b) => (a.dir > b.dir ? 1 : a.dir < b.dir ? -1 : 0) || order(a.key) - order(b.key));
}

/** Heavy/server compatibility problems: [{ path, index, message }] */
export function lint(model) {
  const issues = [];
  const add = (path, index, message) => issues.push({ path, index, message });
  eachCanvas(model, (cv, path) => cv.nodes.forEach((n, i) => {
    const text = n.atoms.join(" ");
    if (/[^\x20-\x7e]/.test(text)) add(path, i, "Only plain ASCII text is allowed");
    if (/["`\\]/.test(text)) add(path, i, 'Characters " ` and \\ are not allowed');
    if (n.kind !== "obj") return;
    const cls = classOf(n);
    if (!cls) return;
    if (cls === "declare") return add(path, i, "[declare] isn't supported: keep the patch in one file");
    if (!heavyOk(cls)) return add(path, i, `[${cls}] isn't supported by Heavy`);
    const name = n.atoms[1];
    if (NAMED.has(cls) && name && !isNumber(name) && (!BUS.test(name) || name.length > 64)) add(path, i, `Name "${name}" can't contain $ (except $0), ; or ,`);
    const hv = n.atoms.find(a => a.startsWith("@hv_"));
    if (hv) add(path, i, `${hv} isn't used on the Lich (use @raw)`);
    if (["r", "receive", "s", "send"].includes(cls)) {
      const at = n.atoms.findIndex(a => /^@(raw|owl)(_param)?$/.test(a));
      if (at > 0 && !isOwlKey(n.atoms[at + 1] ?? "")) add(path, i, `${n.atoms[at]} needs A–H, AA–DH, Push, Red, Green or B1–B11`);
      if (name?.startsWith("Channel-") && !isOwlKey(name.slice(8).replace(/>$/, ""))) add(path, i, `Unknown OWL channel "${name}"`);
      const b = owlBinding(n);
      if (b && at > 0 && b.min === b.max) add(path, i, "min and max must differ");
    }
    if (cls === "expr" || cls === "expr~") {
      const p = exprProblem(n.atoms.slice(1).join(" "));
      if (p) add(path, i, `[${cls}] ${p}`);
    }
  }));
  const size = new Blob([serialize(model)]).size;
  if (size > 256 * 1024) add("0", -1, "Patch is larger than 256 KB");
  return issues;
}

/** Patch names the server (and OWL header) accept. */
export const cleanName = s => (s || "").replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 23) || "Pd Patch";
