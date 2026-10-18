// What the editor knows about Pd objects: inlet/outlet layout, signal vs control, and whether
// the Heavy compiler (the hvcc fork OwlProgram uses) can build them. The list mirrors
// lich-patcher-server/src/pd/objects.rs; the server is the final word.
import { classOf } from "./model.js";

// ports: inlets → outlets, "~" = signal, "c" = control. Functions get the arguments.
const rep = (ch, k) => ch.repeat(Math.max(0, k));

const P = {
  "osc~": "~c>~", "phasor~": "~c>~", "noise~": "c>~", "sig~": "c>~", "line~": "cc>~",
  "lop~": "~c>~", "hip~": "~c>~", "bp~": "~cc>~", "vcf~": "~~c>~~", "biquad~": "~c>~",
  "rpole~": "~~>~", "rzero~": "~~>~", "rzero_rev~": "~~>~", "cpole~": "~~~~>~~", "czero~": "~~~~>~~", "czero_rev~": "~~~~>~~",
  "env~": "~>c", "snapshot~": "~>c", "samphold~": "~~>~", "delwrite~": "~>", "delread~": "c>~", "vd~": "~>~",
  "tabread~": "~>~", "tabread4~": "~c>~", "tabwrite~": "~>", "tabplay~": "c>~c", "tabosc4~": "~c>~",
  "throw~": "~>", "catch~": ">~", "s~": "~>", "send~": "~>", "r~": "c>~", "receive~": "c>~",
  "clip~": "~cc>~", "samplerate~": "c>c", "lorenz~": "ccc>~~~", "conv~": "~~>~",
  "loadbang": ">c", "print": "c>", "metro": "cc>c", "del": "cc>c", "delay": "cc>c", "pipe": "cc>c",
  "line": "ccc>c", "timer": "cc>c", "random": "cc>c", "until": "cc>c", "change": "c>c", "spigot": "cc>c",
  "moses": "cc>cc", "swap": "cc>cc", "makenote": "ccc>cc", "poly": "ccc>ccc", "clip": "ccc>c",
  "f": "cc>c", "float": "cc>c", "i": "cc>c", "int": "cc>c", "symbol": "cc>c", "b": "c>c", "bang": "c>c",
  "atan2": "cc>c", "log": "cc>c", "tabread": "c>c", "tabwrite": "cc>", "table": "c>",
  "notein": ">ccc", "ctlin": ">ccc", "bendin": ">cc", "pgmin": ">cc", "touchin": ">cc", "midiin": ">cc",
  "noteout": "ccc>", "ctlout": "ccc>", "bendout": "cc>", "pgmout": "cc>", "touchout": "cc>", "midiout": "cc>",
  "inlet": ">c", "inlet~": ">~", "outlet": "c>", "outlet~": "~>",
  "delread4~": "~>~", "bang~": ">c", "threshold~": "~cc>cc", "stripnote": "cc>cc", "list": "cc>c",
  "polytouchin": ">ccc", "polytouchout": "ccc>", "midirealtimein": ">cc", "else/knob": "c>c", "else/popmenu": "c>c",
  "bng": "c>c", "tgl": "c>c", "hsl": "c>c", "vsl": "c>c", "nbx": "c>c", "hradio": "c>c", "vradio": "c>c", "cnv": ">",
};
for (const o of ["abs", "sqrt", "exp", "cos", "sin", "tan", "atan", "mtof", "ftom", "dbtorms", "rmstodb", "powtodb", "dbtopow", "wrap"]) P[o] = "c>c";
for (const o of ["abs~", "cos~", "exp~", "wrap~", "sqrt~", "rsqrt~", "q8_sqrt~", "q8_rsqrt~", "mtof~", "ftom~", "dbtorms~", "rmstodb~", "powtodb~", "dbtopow~"]) P[o] = "~>~";
export const BINOPS = ["+", "-", "*", "/", "mod", "div", "%", "max", "min", "&", "&&", "|", "||", "==", "!=", "<", "<=", ">", ">=", "pow", ">>", "<<"];
for (const o of BINOPS) P[o] = "cc>c";
for (const o of ["+~", "-~", "*~", "/~", "max~", "min~", "pow~"]) P[o] = "~~>~";

/** Classes Wasted Audio hvcc 0.17.2 can compile (copied from lich-patcher-server/src/pd/objects.rs). */
export const HEAVY = new Set([
  "!=", "!=~", "%", "&", "&&", "*", "*~", "+", "+~", "-", "-~", "/", "/~", "<", "<<", "<=", "<=~",
  "<~", "==", "==~", ">", ">=", ">=~", ">>", ">~", "abs", "abs~", "adc~", "atan", "atan2", "b",
  "bang", "bang~", "bendin", "bendout", "biquad~", "bng", "bp~", "catch~", "change", "clip",
  "clip~", "cnv", "conv~", "cos", "cos~", "cpole~", "ctlin", "ctlout", "cyclone/!=~",
  "cyclone/<=~", "cyclone/<~", "cyclone/==~", "cyclone/>=~", "cyclone/>~", "cyclone/acosh~",
  "cyclone/acos~", "cyclone/asinh~", "cyclone/asin~", "cyclone/atan2~", "cyclone/atanh~",
  "cyclone/atan~", "cyclone/bitand~", "cyclone/bitnot~", "cyclone/bitor~", "cyclone/bitsafe~",
  "cyclone/bitxor~", "cyclone/cartopol~", "cyclone/cosh~", "cyclone/cosx~", "cyclone/equals~",
  "cyclone/greaterthaneq~", "cyclone/greaterthan~", "cyclone/lessthaneq~", "cyclone/lessthan~",
  "cyclone/notequals~", "cyclone/poltocar~", "cyclone/sinh~", "cyclone/sinx~", "cyclone/tanh~",
  "cyclone/tanx~", "czero_rev~", "czero~", "dac~", "dbtopow", "dbtopow~", "dbtorms", "dbtorms~",
  "del", "delay", "delread4~", "delread~", "delwrite~", "div", "else/knob", "else/popmenu", "env~",
  "equals~", "exp", "expr", "expr~", "exp~", "f", "float", "ftom", "ftom~", "greaterthaneq~",
  "greaterthan~", "hip~", "hradio", "hsl", "i", "inlet", "inlet~", "int", "lessthaneq~",
  "lessthan~", "line", "line~", "list", "loadbang", "log", "lop~", "makenote", "max", "max~",
  "metro", "midiin", "midiout", "midirealtimein", "min", "min~", "mod", "moses", "mtof", "mtof~",
  "nbx", "noise~", "notein", "noteout", "notequals~", "osc~", "outlet", "outlet~", "pack", "pgmin",
  "pgmout", "phasor~", "pipe", "poly", "polytouchin", "polytouchout", "pow", "powtodb", "powtodb~",
  "pow~", "print", "q8_rsqrt~", "q8_sqrt~", "r", "random", "receive", "receive~", "rmstodb",
  "rmstodb~", "route", "rpole~", "rsqrt~", "rzero_rev~", "rzero~", "r~", "s", "samphold~",
  "samplerate~", "sel", "select", "send", "send~", "sig~", "sin", "snapshot~", "spigot", "sqrt",
  "sqrt~", "stripnote", "swap", "symbol", "s~", "t", "table", "tabosc4~", "tabplay~", "tabread",
  "tabread4~", "tabread~", "tabwrite", "tabwrite~", "tan", "tgl", "threshold~", "throw~", "timer",
  "touchin", "touchout", "trigger", "unpack", "until", "vcf~", "vd~", "vradio", "vsl", "wrap",
  "wrap~", "|", "||",
]);

/** Functions hvcc's expr grammar accepts (server: EXPR_FUNCTIONS). */
export const EXPR_FUNCTIONS = new Set([
  "abs", "acos", "acosh", "asin", "asinh", "atan", "atan2", "atanh", "cbrt", "ceil", "copysign",
  "cos", "cosh", "drem", "erf", "erfc", "exp", "expm1", "fact", "finite", "float", "floor", "fmod",
  "if", "imodf", "int", "isinf", "isnan", "ldexp", "ln", "log", "log10", "log1p", "max", "min",
  "modf", "nearbyint", "pow", "remainder", "rint", "round", "sin", "sinh", "sqrt", "tan", "tanh",
  "trunc",
]);

function dynamic(cls, args) {
  const k = args.length;
  switch (cls) {
    case "t": case "trigger": return "c>" + rep("c", k || 2);
    case "pack": return rep("c", k || 2) + ">c";
    case "unpack": return "c>" + rep("c", k || 2);
    case "route": case "sel": case "select": return (k <= 1 ? "cc" : "c") + ">" + rep("c", (k || 1) + 1);
    case "adc~": return "c>" + rep("~", k || 2);
    case "dac~": return rep("~", k || 2) + ">";
    case "s": case "send": return (k ? "c" : "cc") + ">";
    case "r": case "receive": return (k ? "" : "c") + ">c";
    case "+~": case "-~": case "*~": case "/~": case "max~": case "min~": case "pow~": return (k ? "~c" : "~~") + ">~";
    case "expr": case "expr~": {
      // one inlet per $f/$i/$v index used; expr~'s first inlet is a signal
      const ids = [...args.join(" ").matchAll(/\$([fiv])(\d+)/g)].map(m => [m[1], +m[2]]);
      const n = Math.max(1, ...ids.map(([, i]) => i));
      let ins = "";
      for (let i = 1; i <= n; i++) ins += ids.some(([t, j]) => j === i && t === "v") || (cls === "expr~" && i === 1) ? "~" : "c";
      return ins + ">" + (cls === "expr~" ? "~" : "c");
    }
  }
  return null;
}

const split = s => { const [i, o] = s.split(">"); return { ins: [...i], outs: [...o] }; };

/** Ports of a node. Unknown objects get as many as their connections use. */
export function ports(node) {
  switch (node.kind) {
    case "msg": case "floatatom": case "symbolatom": return { ins: ["c"], outs: ["c"] };
    case "text": case "graph": return { ins: [], outs: [] };
    case "sub": {
      const lets = (names) => node.canvas.nodes
        .filter(m => names.includes(classOf(m)))
        .sort((a, b) => a.x - b.x)
        .map(m => classOf(m).endsWith("~") ? "~" : "c");
      return { ins: lets(["inlet", "inlet~"]), outs: lets(["outlet", "outlet~"]) };
    }
  }
  const cls = classOf(node), args = node.atoms.slice(1);
  if (!cls) return { ins: [], outs: [] };
  if (isNumber(cls)) return { ins: ["c", "c"], outs: ["c"] };
  const d = dynamic(cls, args) ?? P[cls];
  if (d) return split(d);
  // Heavy objects without a layout above (cyclone/*~ …): signal in/out guess, widened by connections
  if (HEAVY.has(cls)) return cls.endsWith("~") ? { ins: ["~"], outs: ["~"] } : { ins: ["c"], outs: ["c"] };
  return { ins: ["c"], outs: ["c"], unknown: true };
}

export const isNumber = t => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t);
export const heavyOk = cls => HEAVY.has(cls) || isNumber(cls);
export const isSignal = cls => !!cls && cls.endsWith("~");

/** Palette: grouped classes with a one-line hint. */
export const PALETTE = [
  ["Lich I/O", [
    ["adc~", "audio inputs L R"], ["dac~", "audio outputs L R"],
    ["r A @raw A", "knob or CV A (also B–H, AA…)"], ["s Out @raw F", "parameter / CV out F or G"],
    ["r Btn @raw Push", "button 1 (Push, B1–B11)"], ["s Gate @raw B1", "gate output"],
  ]],
  ["Oscillators", [["osc~", "sine"], ["phasor~", "ramp 0..1"], ["noise~", "white noise"], ["tabosc4~", "wavetable"], ["lorenz~", "chaotic"]]],
  ["Filters", [["lop~", "1-pole lowpass"], ["hip~", "1-pole highpass"], ["bp~", "bandpass"], ["vcf~", "resonant, signal freq"], ["biquad~", "biquad"], ["rpole~", "raw pole"], ["rzero~", "raw zero"]]],
  ["Delay & tables", [["delwrite~ d 1000", "delay line (ms)"], ["delread~ d", "fixed read"], ["vd~ d", "variable read"], ["table t 1024", "array"], ["tabread~ t", "read array"], ["tabwrite~ t", "record array"], ["tabplay~ t", "play array"]]],
  ["Signal math", [["expr~ $v1 * 0.5", "signal expression"], ["*~", "multiply"], ["+~", "add"], ["-~", "subtract"], ["/~", "divide"], ["clip~ -1 1", "clip"], ["wrap~", "wrap 0..1"], ["abs~", "absolute"], ["mtof~", "midi → Hz"], ["sig~", "number → signal"], ["line~", "ramp"], ["snapshot~", "signal → number"], ["env~", "envelope dB"], ["samphold~", "sample & hold"], ["throw~ bus", "sum to bus"], ["catch~ bus", "read bus"]]],
  ["Control", [["loadbang", "at load"], ["metro 100", "clock"], ["delay 100", "delay a bang"], ["line", "ramp numbers"], ["f", "store float"], ["t b f", "order outputs"], ["sel 0", "match"], ["route a b", "route by selector"], ["pack f f", "combine"], ["unpack f f", "split"], ["moses 0.5", "split by value"], ["spigot", "gate"], ["change", "drop repeats"], ["random 10", "random int"], ["timer", "time between bangs"], ["print", "console"]]],
  ["Math", [["expr $f1 * 2", "C-like expression"], ["+", "add"], ["-", "subtract"], ["*", "multiply"], ["/", "divide"], ["mod 4", "modulo"], ["mtof", "midi → Hz"], ["clip 0 1", "clip"], ["pow", "power"], ["sqrt", "root"], ["==", "compare"], ["max", "max"], ["min", "min"]]],
  ["MIDI", [["notein", "notes"], ["ctlin", "CCs"], ["bendin", "pitch bend"], ["noteout", "send notes"], ["ctlout", "send CC"]]],
  ["UI", [["bng", "bang button"], ["tgl", "toggle"], ["hsl", "slider"], ["nbx", "number"]]],
  ["Structure", [["inlet", "subpatch inlet"], ["inlet~", "signal inlet"], ["outlet", "subpatch outlet"], ["outlet~", "signal outlet"], ["s name", "send"], ["r name", "receive"]]],
];
