// Builds the editor's object docs from upstream sources (run by hand when bumping versions):
//
//   npm run docs                       fetches the pinned sources below (runs before dev/build;
//                                      skipped when the output already matches the pins)
//   npm run docs -- --force            regenerate anyway
//   node scripts/pd-docs.mjs <pure-data checkout> <hvcc checkout>   uses local checkouts
//
// The output (src/js/pd/docs.json, public/help/) is not committed; Netlify generates it on build.
//
// - Pd vanilla help patches (BSD-3, pure-data/doc/5.reference): each has a "reference"
//   subpatch laid out as canvases labelled INLETS: / 1st: / OUTLET: / ARGUMENTS: with text
//   rows under them. We rebuild that structure from positions.
// - hvcc's supported-objects table (docs/reference/objects/supported.md) for Heavy limitations.
//
// Writes src/js/pd/docs.json and copies the help patches for Heavy objects to public/help/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { records, unescape } from "../src/js/pd/model.js";
import { HEAVY } from "../src/js/pd/objects.js";

// Keep in step with the preview and the build server:
// - Pd: the pure-data submodule of libpd-wasm (package.json), i.e. what the preview runs
// - hvcc: HVCC_VERSION in lich-patcher-server/Dockerfile.builder, i.e. what the Lich build uses
const PD_REPO = "https://github.com/pure-data/pure-data.git", PD_COMMIT = "b1ff370c87b579f80130a9cafbf27cd890e90882";
const HVCC_REPO = "https://github.com/Wasted-Audio/hvcc.git", HVCC_TAG = "v0.17.2";

function fetchSources() {
  const dir = join(tmpdir(), "lich-patcher-docs");
  const sh = cmd => execSync(cmd, { stdio: ["ignore", "ignore", "inherit"] });
  const pd = join(dir, "pure-data"), hv = join(dir, "hvcc");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.log(`fetching pure-data ${PD_COMMIT.slice(0, 7)} (doc/5.reference only) and hvcc ${HVCC_TAG}…`);
  sh(`git clone -q --filter=blob:none --sparse ${PD_REPO} "${pd}"`);
  sh(`git -C "${pd}" sparse-checkout set doc/5.reference`);
  sh(`git -C "${pd}" checkout -q ${PD_COMMIT}`);
  sh(`git clone -q --depth 1 --branch ${HVCC_TAG} --filter=blob:none --sparse ${HVCC_REPO} "${hv}"`);
  sh(`git -C "${hv}" sparse-checkout set docs/reference`);
  return [pd, hv];
}

// a change to the pins or to the Heavy object list means the docs have to be rebuilt
const KEY = createHash("sha1").update(["licenses-v1", PD_COMMIT, HVCC_TAG, ...[...HEAVY].sort()].join("\n")).digest("hex").slice(0, 12);
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (args.length < 2 && !process.argv.includes("--force")) {
  try {
    const meta = JSON.parse(readFileSync("src/js/pd/docs.json", "utf8"))._meta;
    if (meta?.key === KEY && existsSync("public/help/LICENSE.txt")) { console.log("pd docs up to date"); process.exit(0); }
  } catch { /* not generated yet */ }
}

const [pdRoot, hvccRoot] = args.length >= 2 ? args : fetchSources();
const REF = join(pdRoot, "doc/5.reference");
const NO_REFERENCE = { sliders: ["hsl", "vsl"], radio: ["hradio", "vradio"], "inlet-outlet": ["inlet", "inlet~", "outlet", "outlet~"] };
// cyclone's signal math has no vanilla help patch; one line each, linked to cyclone's docs
const CYCLONE = {
  "acos~": "arc cosine of a signal", "acosh~": "hyperbolic arc cosine of a signal", "asin~": "arc sine of a signal",
  "asinh~": "hyperbolic arc sine of a signal", "atan~": "arc tangent of a signal", "atan2~": "arc tangent of two signals (y, x)",
  "atanh~": "hyperbolic arc tangent of a signal", "cosh~": "hyperbolic cosine of a signal", "cosx~": "cosine of a signal in radians",
  "sinh~": "hyperbolic sine of a signal", "sinx~": "sine of a signal in radians", "tanh~": "hyperbolic tangent of a signal (soft clipper)",
  "tanx~": "tangent of a signal in radians", "bitand~": "bitwise AND of two signals", "bitor~": "bitwise OR of two signals",
  "bitxor~": "bitwise XOR of two signals", "bitnot~": "bitwise NOT of a signal", "bitsafe~": "replace NaN and infinity with 0",
  "cartopol~": "cartesian (real, imaginary) to polar (amplitude, phase)", "poltocar~": "polar (amplitude, phase) to cartesian",
  "equals~": "1 where the signals are equal, else 0", "notequals~": "1 where the signals differ, else 0",
  "greaterthan~": "1 where left > right, else 0", "greaterthaneq~": "1 where left >= right, else 0",
  "lessthan~": "1 where left < right, else 0", "lessthaneq~": "1 where left <= right, else 0",
  "==~": "1 where the signals are equal, else 0", "!=~": "1 where the signals differ, else 0", ">~": "1 where left > right, else 0",
  ">=~": "1 where left >= right, else 0", "<~": "1 where left < right, else 0", "<=~": "1 where left <= right, else 0",
};
const ELSE = { "else/knob": "rotary knob GUI (a number on the Lich)", "else/popmenu": "pop-up menu GUI (a number on the Lich)" };
// Heavy-only or legacy objects without a vanilla help patch
const EXTRA = {
  "conv~": "convolve a signal with a table (Heavy only)",
  "q8_sqrt~": "fast approximate square root of a signal (legacy)",
  "q8_rsqrt~": "fast approximate reciprocal square root of a signal (legacy)",
  // vanilla objects whose help patch has no one-line description
  "%": "remainder (modulo) of two integers", "cnv": "canvas: a coloured rectangle to organise the patch",
  "czero~": "complex one-zero filter (raw)", "rsqrt~": "reciprocal square root of a signal",
  "vradio": "vertical radio buttons", "vsl": "vertical slider", "hradio": "horizontal radio buttons", "hsl": "horizontal slider",
};
const ALIAS = { "vd~": "delread4~", f: "float", i: "int", b: "bang", t: "trigger", del: "delay", sel: "select", s: "send", r: "receive", "s~": "send~", "r~": "receive~" };

/** Split a help file into canvases: [{ name, recs, depth }] with records kept per canvas. */
function canvases(src) {
  const out = [], stack = [];
  for (const r of records(src)) {
    if (r[0] === "#N" && r[1] === "canvas") {
      const c = { name: r[6] ?? "", recs: [], depth: stack.length };
      stack.push(c); out.push(c);
    } else if (r[0] === "#X" && r[1] === "restore") stack.pop();
    else stack.at(-1)?.recs.push(r);
  }
  return out;
}

const textOf = toks => {
  let t = toks;
  const w = t.lastIndexOf(",");
  if (w >= 0 && t[w + 1] === "f" && t.length === w + 3) t = t.slice(0, w);
  return t.map(unescape).join(" ").replace(/ ([,;.:)])/g, "$1").replace(/\( /g, "(").trim();
};

/** Parse one reference canvas. A canvas can document several objects one after another
 *  (delwrite~ … then delread~ delread4~ …): each row of title objects owns the area below it. */
function parseReference(c) {
  const marks = [], texts = [], objs = [];
  for (const r of c.recs) {
    if (r[0] !== "#X") continue;
    const x = +r[2], y = +r[3];
    if (r[1] === "obj" && r[4] === "cnv") {
      const label = r[10];   // #X obj x y cnv size w h send receive LABEL …
      if (label && label !== "empty") marks.push({ y, label: label.replace(/:$/, "") });
    } else if (r[1] === "obj" && r[4]) objs.push({ x, y, cls: r[4] });
    else if (r[1] === "text") texts.push({ x, y, text: textOf(r.slice(4)) });
  }
  // title rows: objects at (nearly) the same height
  const titles = [];
  for (const o of objs.sort((a, b) => a.y - b.y)) {
    const t = titles.at(-1);
    if (t && Math.abs(t.y - o.y) < 8) t.classes.push(o.cls); else titles.push({ y: o.y, classes: [o.cls] });
  }
  return titles.map((t, k) => {
    const lo = t.y - 8, hi = titles[k + 1] ? titles[k + 1].y - 8 : Infinity;
    const inSeg = v => v.y >= lo && v.y < hi;
    return { objects: t.classes, ...parseSegment(marks.filter(inSeg), texts.filter(inSeg)) };
  });
}

function parseSegment(marks, texts) {
  marks.sort((a, b) => a.y - b.y);
  const firstMark = marks[0]?.y ?? Infinity;
  const summary = texts.filter(t => t.y < firstMark && t.text.startsWith("-")).map(t => t.text.replace(/^-\s*/, ""))[0] || "";
  // group texts into rows (same y within 8 px), left to right
  const body = texts.filter(t => t.y >= firstMark).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const t of body) {
    const row = rows.at(-1);
    if (row && Math.abs(row.y - t.y) < 8) row.parts.push(t); else rows.push({ y: t.y, parts: [t] });
  }
  const sections = {};
  let major = null, minor = null;
  const MAJOR = /^(INLETS?|OUTLETS?|ARGUMENTS?|FLAGS?|MESSAGES?|METHODS?)$/i;
  for (const row of rows) {
    for (const m of marks.filter(m => m.y <= row.y)) {
      if (MAJOR.test(m.label)) { if (major !== m) { major = m; minor = null; } }
      else if (major && m.y >= major.y) minor = m;
    }
    if (!major) continue;
    const key = major.label.toUpperCase().replace(/S?$/, "S");
    const list = sections[key] ??= [];
    const label = minor && minor.y >= major.y ? minor.label : "";
    let block = list.find(b => b.label === label);
    if (!block) list.push(block = { label, lines: [] });
    block.lines.push(row.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(" ").replace(/\s+-\s+/, " – "));
  }
  return { summary, sections };
}

const score = e => (e.summary ? 1 : 0) + ["INLETS", "OUTLETS", "ARGUMENTS"].filter(k => e[k]).length;

/** Summary line from the help patch itself: the "- ..." text next to the title object. */
function mainSummary(c, cls) {
  const title = c.recs.find(r => r[1] === "obj" && r[4] === cls);
  if (!title) return "";
  const y = +title[3];
  const t = c.recs.find(r => r[1] === "text" && Math.abs(+r[3] - y) < 6 && r[4] === "-");
  return t ? textOf(t.slice(5)) : "";
}

/* ───────── Pd reference ───────── */
const docs = {};
const files = readdirSync(REF).filter(f => f.endsWith("-help.pd"));
for (const file of files) {
  const src = readFileSync(join(REF, file), "latin1");
  const cs = canvases(src);
  const tilde = /tilde/.test(file);
  for (const c of cs.filter(c => c.name === "reference")) {
    for (const ref of parseReference(c)) {
      for (let cls of ref.objects) {
        // binops-tilde-help titles its objects "+ - * /" without the ~
        if (tilde && !cls.endsWith("~") && HEAVY.has(cls + "~")) cls += "~";
        const entry = { help: file, summary: ref.summary || mainSummary(cs[0], cls), ...ref.sections };
        // index canvases list titles without details: keep whichever entry says more
        if (!docs[cls] || score(entry) > score(docs[cls])) docs[cls] = entry;
      }
    }
  }
  // help files without a reference section still document the objects they're about
  const base = file.replace(/-help\.pd$/, "");
  const group = NO_REFERENCE[base] ?? [base];
  const shared = group.map(cls => mainSummary(cs[0], cls)).find(Boolean) || "";
  for (const cls of group) {
    if (!docs[cls]?.summary && cs[0]) docs[cls] = { help: file, ...docs[cls], summary: mainSummary(cs[0], cls) || shared };
  }
}
for (const [a, b] of Object.entries(ALIAS)) if (docs[b] && !docs[a]) docs[a] = { ...docs[b], alias: b };

/* ───────── hvcc limitations ───────── */
const md = readFileSync(join(hvccRoot, "docs/reference/objects/supported.md"), "utf8");
const notes = {};
let footnotes = {}, rows = [];
const flush = () => {
  for (const [obj, lim] of rows) {
    const text = lim.replace(/<sup>(\d+)<\/sup>/g, (_, n) => footnotes[n] ? ` (${footnotes[n]})` : "").replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
    if (text) notes[obj] = text;
  }
  rows = []; footnotes = {};
};
for (const line of md.split("\n")) {
  if (/^## /.test(line)) flush();
  const row = /^\| ([^|]+?) \| ([^|]*?) \|$/.exec(line.replace(/\\\|/g, "¦"));
  if (row && row[1] !== "object" && !/^-+$/.test(row[1])) rows.push([row[1].replace(/¦/g, "|"), row[2].replace(/¦/g, "|")]);
  const fn = /^(\d+)\. (.+)$/.exec(line);
  if (fn) footnotes[fn[1]] = fn[2].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`/g, "");
}
flush();

/* ───────── keep what the editor can use ───────── */
const out = {};
mkdirSync("public/help", { recursive: true });
for (const f of readdirSync("public/help")) rmSync(join("public/help", f));
const helpFiles = new Set();
for (const cls of [...HEAVY].sort()) {
  const d = docs[cls];
  const entry = {};
  if (d) {
    Object.assign(entry, d);
    helpFiles.add(d.help);
  } else if (CYCLONE[cls.replace(/^cyclone\//, "")]) {
    Object.assign(entry, { summary: CYCLONE[cls.replace(/^cyclone\//, "")], link: "https://github.com/porres/pd-cyclone/wiki" });
  } else if (ELSE[cls]) {
    Object.assign(entry, { summary: ELSE[cls], link: "https://github.com/porres/pd-else" });
  }
  if (!entry.summary && EXTRA[cls]) entry.summary = EXTRA[cls];
  if (notes[cls]) entry.heavy = notes[cls];
  if (Object.keys(entry).length) out[cls] = entry;
}
// helper abstractions the help patches use (DSP toggle, GUI demos)
for (const f of ["set-dsp-tgl.pd", "all_guis.pd", "pd-messages.pd"]) helpFiles.add(f);
for (const f of helpFiles) copyFileSync(join(REF, f), join("public/help", f));
copyFileSync(join(pdRoot, "LICENSE.txt"), "public/help/LICENSE.txt");
const git = args => { try { return execSync(`git -C "${pdRoot}" ${args}`, { encoding: "utf8" }).trim(); } catch { return null; } };
out._meta = { key: KEY, pd: git("describe --tags"), pdCommit: git("rev-parse HEAD"), hvcc: HVCC_TAG.replace(/^v/, ""), licenses: { pd: "BSD-3-Clause", hvcc: "GPL-3.0-or-later", notices: "CREDITS.md" }, helpers: ["set-dsp-tgl.pd", "all_guis.pd", "pd-messages.pd"] };
writeFileSync("src/js/pd/docs.json", JSON.stringify(out, null, 1) + "\n");
const missing = [...HEAVY].filter(c => !out[c]?.summary);
console.log(`docs for ${Object.keys(out).length - 1}/${HEAVY.size} Heavy objects, ${helpFiles.size} help patches; no summary: ${missing.join(" ")}`);
