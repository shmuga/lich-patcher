// Pd model, OWL bindings, Heavy lint and preview augmentation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parse, serialize, records, textAtoms, atomsText, removeNodes, classOf } from "../src/js/pd/model.js";
import { ports, heavyOk } from "../src/js/pd/objects.js";
import { bindings, lint, cleanName, owlBinding } from "../src/js/pd/owl.js";
import { previewPatch } from "../src/js/pd/preview.js";
import { TEMPLATES } from "../src/js/pd/templates.js";

const heavyTest = new URL("../../OwlProgram/TestPatches/HeavyTest/HeavyTest.pd", import.meta.url);

test("records keep escapes and split , and ;", () => {
  assert.deepEqual(records("#X msg 1 2 \\; pd dsp 1 \\, 2;\n#X obj 1 2 f, f 10;"), [
    ["#X", "msg", "1", "2", "\\;", "pd", "dsp", "1", "\\,", "2"],
    ["#X", "obj", "1", "2", "f", ",", "f", "10"],
  ]);
  assert.deepEqual(textAtoms("; pd dsp 1, 2"), [";", "pd", "dsp", "1", ",", "2"]);
  assert.equal(atomsText([";", "pd", "dsp", "1"], "msg"), ";\npd dsp 1");
});

test("parse → serialize is stable, including subpatches, widths and arrays", () => {
  const src = [
    "#N canvas 0 50 450 300 12;",
    "#X obj 10 10 osc~ 440, f 12;",
    "#X msg 10 40 \\$1 20;",
    "#N canvas 0 50 300 200 inner 0;",
    "#X obj 10 10 inlet;",
    "#X obj 10 50 outlet;",
    "#X connect 0 0 1 0;",
    "#X restore 10 80 pd inner;",
    "#N canvas 0 50 450 250 (subpatch) 0;",
    "#X array tab 3 float 2;",
    "#X coords 0 1 3 -1 200 140 1;",
    "#A 0 0.1 0.2 0.3;",
    "#X restore 200 10 graph;",
    "#X floatatom 10 120 5 0 0 0 - - - 0;",
    "#X text 10 150 a comment \\, with comma;",
    "#X connect 1 0 0 0;",
    "#X connect 0 0 2 0;",
  ].join("\n") + "\n";
  const m = parse(src);
  assert.equal(m.root.nodes.length, 6);
  assert.equal(m.root.nodes[0].width, 12);
  assert.deepEqual(m.root.nodes[1].atoms, ["$1", "20"]);
  assert.equal(m.root.nodes[2].kind, "sub");
  assert.equal(m.root.nodes[3].kind, "graph");
  assert.equal(serialize(m), src);
});

test("the OwlProgram HeavyTest patch round trips", { skip: !existsSync(heavyTest) }, () => {
  const src = readFileSync(heavyTest, "utf8");
  const once = serialize(parse(src));
  assert.equal(serialize(parse(once)), once);
  assert.equal(parse(src).root.nodes.length, 16);
  assert.deepEqual(lint(parse(src)), []);
  assert.deepEqual(bindings(parse(src)).map(b => `${b.dir}:${b.key}:${b.name}`),
    ["in:A:Osc1", "in:B:Osc2", "in:C:Osc3", "out:F:Send1", "out:G:Send2"]);
});

test("ports follow arguments", () => {
  const n = atoms => ({ kind: "obj", x: 0, y: 0, atoms, width: null });
  assert.deepEqual(ports(n(["t", "b", "f", "f"])).outs.length, 3);
  assert.deepEqual(ports(n(["pack", "f", "f", "f"])).ins.length, 3);
  assert.deepEqual(ports(n(["route", "a", "b"])), { ins: ["c"], outs: ["c", "c", "c"] });
  assert.deepEqual(ports(n(["sel", "0"])), { ins: ["c", "c"], outs: ["c", "c"] });
  assert.deepEqual(ports(n(["*~", "0.5"])), { ins: ["~", "c"], outs: ["~"] });
  assert.deepEqual(ports(n(["dac~"])), { ins: ["~", "~"], outs: [] });
  assert.deepEqual(ports(n(["r", "x"])), { ins: [], outs: ["c"] });
  assert.equal(ports(n(["bob~", "1"])).unknown, true);
  const sub = parse("#N canvas 0 0 1 1 12;\n#N canvas 0 0 1 1 s 0;\n#X obj 50 1 inlet~;\n#X obj 10 1 inlet;\n#X obj 1 50 outlet~;\n#X restore 1 1 pd s;\n").root.nodes[0];
  assert.deepEqual(ports(sub), { ins: ["c", "~"], outs: ["~"] });
});

test("@owl bindings: positional and named ranges, Channel- names, buttons", () => {
  const b = atoms => owlBinding({ kind: "obj", atoms });
  assert.deepEqual(b(["r", "Freq", "@owl", "A", "50", "2000", "440"]), { name: "Freq", dir: "in", key: "A", min: 50, max: 2000, def: 440, button: false });
  assert.deepEqual(b(["r", "X", "@owl", "C", "@owl_min", "400", "@owl_max", "4000", "@owl_default", "800"]), { name: "X", dir: "in", key: "C", min: 400, max: 4000, def: 800, button: false });
  assert.equal(b(["s", "Channel-F"]).key, "F");
  assert.equal(b(["r", "Btn", "@owl", "Push"]).button, true);
  assert.deepEqual(b(["r", "Freq", "@raw", "A", "50", "2000"]), { name: "Freq", dir: "in", key: "A", min: 50, max: 2000, def: null, button: false });
  assert.deepEqual(b(["s", "G", "@raw_param", "B11", "@raw_min", "-1"]), { name: "G", dir: "out", key: "B11", min: -1, max: 1, def: null, button: true });
  assert.equal(b(["r", "plain"]), null);
});

test("lint flags what the server would reject", () => {
  const m = parse("#N canvas 0 0 1 1 12;\n#X obj 1 1 bob~ 1;\n#X obj 1 30 declare -path x;\n#X obj 1 60 r Freq @owl Q;\n#X obj 1 90 r a$b;\n#X text 1 120 café;\n#X obj 1 150 osc~;\n");
  const msgs = lint(m).map(i => i.message);
  assert.equal(msgs.length, 5, msgs.join(" | "));
  assert.ok(msgs[0].includes("bob~"));
  assert.ok(msgs[1].includes("declare"));
  assert.ok(msgs[2].includes("@owl"));
  assert.ok(msgs[3].includes("can't contain"));
  assert.ok(msgs[4].includes("ASCII"));
  assert.ok(heavyOk("vcf~") && heavyOk("440") && heavyOk("expr~") && heavyOk("cyclone/tanh~") && !heavyOk("bob~"));
  assert.equal(cleanName('My "Delay"; rm -rf /'), "My Delay rm -rf");
});

test("expr: hvcc's grammar only, since control expr text becomes C", () => {
  const e = text => lint(parse(`#N canvas 0 0 1 1 12;\n#X obj 1 1 ${text};\n`)).map(i => i.message);
  assert.deepEqual(e("expr if(\\$f1 > 0.5 \\, 1 \\, 0) * pow(\\$f2 \\, 2)"), []);
  assert.deepEqual(e("expr~ \\$v1 * 0.5 + sin(\\$f2)"), []);
  for (const bad of ["expr system(1)", "expr 1 } int f() { return 0", "expr \\$s1", "expr (1", "expr size(t)", "expr a[1]"])
    assert.ok(e(bad).some(m => m.startsWith("[expr]")), bad);
  assert.deepEqual(e("r F @raw A 5 5"), ["min and max must differ"]);
  assert.deepEqual(e("r F @raw Red"), []);
  const expr = n => ports({ kind: "obj", atoms: n.split(" ") });
  assert.deepEqual(expr("expr $f1 + $f3"), { ins: ["c", "c", "c"], outs: ["c"] });
  assert.deepEqual(expr("expr~ $v1 * $f2"), { ins: ["~", "c"], outs: ["~"] });
});

test("every template is Heavy-clean and round trips", () => {
  for (const t of TEMPLATES) {
    const m = parse(t.pd);
    assert.deepEqual(lint(m), [], t.name);
    assert.equal(serialize(parse(serialize(m))), serialize(m), t.name);
    // connections point at real ports
    for (const c of m.root.conns) {
      const a = m.root.nodes[c.from], b = m.root.nodes[c.to];
      assert.ok(c.outlet < ports(a).outs.length, `${t.name}: outlet ${c.outlet} of [${a.atoms.join(" ")}]`);
      assert.ok(c.inlet < ports(b).ins.length, `${t.name}: inlet ${c.inlet} of [${b.atoms.join(" ")}]`);
    }
  }
});

test("preview wires hidden send/receives to clickable boxes only", () => {
  const m = parse("#N canvas 0 0 1 1 12;\n#X msg 1 1 1;\n#X floatatom 1 40 5 0 0 0 - - - 0;\n#X obj 1 80 osc~;\n#N canvas 0 0 1 1 s 0;\n#X obj 1 1 tgl 15 0 empty empty empty 17 7 0 10 #fcfcfc #000000 #000000 0 1;\n#X restore 1 120 pd s;\n");
  const { text, outs } = previewPatch(m);
  const p = parse(text);
  assert.deepEqual([...outs].sort(), ["__uo_0-3_0", "__uo_0_1"]);
  const added = p.root.nodes.slice(4).map(n => n.atoms.join(" "));
  assert.deepEqual(added, ["r __ui_0_0", "r __ui_0_1", "s __uo_0_1"]);
  assert.deepEqual(p.root.nodes[3].canvas.nodes.slice(1).map(n => n.atoms.join(" ")), ["r __ui_0-3_0", "s __uo_0-3_0"]);
  // cyclone/ELSE objects lose their prefix in the preview (libpd-wasm registers bare names)
  const cyc = parse(previewPatch(parse("#N canvas 0 0 1 1 12;\n#X obj 1 1 cyclone/tanh~;\n#X obj 1 30 else/knob;\n")).text);
  assert.deepEqual(cyc.root.nodes.map(n => n.atoms[0]), ["tanh~", "knob"]);
  // help patches' [output~] (volume 0 behind an undrawn GUI) plays through [dac~]
  assert.equal(parse(previewPatch(parse("#N canvas 0 0 1 1 12;\n#X obj 1 1 output~;\n")).text).root.nodes[0].atoms.join(" "), "dac~");
  // the editor's model is untouched
  assert.equal(m.root.nodes.length, 4);
});

test("removeNodes renumbers connections", () => {
  const m = parse("#N canvas 0 0 1 1 12;\n#X obj 1 1 a;\n#X obj 1 1 b;\n#X obj 1 1 c;\n#X connect 0 0 1 0;\n#X connect 1 0 2 0;\n#X connect 0 0 2 0;\n");
  removeNodes(m.root, new Set([1]));
  assert.deepEqual(m.root.nodes.map(classOf), ["a", "c"]);
  assert.deepEqual(m.root.conns, [{ from: 0, outlet: 0, to: 1, inlet: 0 }]);
});

const docsBuilt = existsSync(new URL("../src/js/pd/docs.json", import.meta.url));
test("docs cover every Heavy object and point at shipped help patches", { skip: !docsBuilt && "run `npm run docs` first" }, async () => {
  const { readFileSync } = await import("node:fs");
  const docs = JSON.parse(readFileSync(new URL("../src/js/pd/docs.json", import.meta.url)));
  const { HEAVY } = await import("../src/js/pd/objects.js");
  for (const cls of HEAVY) assert.ok(docs[cls]?.summary, `no summary for ${cls}`);
  for (const [cls, d] of Object.entries(docs)) {
    if (d.help) assert.ok(existsSync(new URL(`../public/help/${d.help}`, import.meta.url)), `${cls}: ${d.help} missing`);
  }
  for (const f of docs._meta.helpers) assert.ok(existsSync(new URL(`../public/help/${f}`, import.meta.url)), f);
});
