// In-browser preview: libpd (WebAssembly) in an AudioWorklet, fed by a test input,
// the microphone or an audio file. Talks to the worklet's message protocol directly
// (see node_modules/libpd-wasm/demo worklet: load / bind / float / bang …).
import { emit } from "../state.js";

const WORKLET = import.meta.env.BASE_URL + "libpd-worklet.js";
const DRUM_LOOP = import.meta.env.BASE_URL + "audio/drum-loop-120.wav";

let ctx = null, node = null, master = null, analyser = null, booting = null;
let started = false;   // libpd, cyclone and ELSE print banners while they set up: drop those
let ready = null, opened = null;
let input = null, inputKind = "none", stream = null;
let drumBuffer = null, inputChange = 0;
const binds = new Set();

export const audio = () => ctx;
export const scope = () => analyser;
export const isRunning = () => ctx?.state === "running";

function onMessage({ data }) {
  switch (data.type) {
    case "ready": started = true; ready?.resolve(); ready = null; break;
    case "patch-opened":
      opened?.[data.ok ? "resolve" : "reject"](new Error("Pd couldn't open the patch"));
      opened = null;
      for (const r of binds) node.port.postMessage({ type: "bind", receiver: r });
      break;
    case "print": if (started) emit("pd:print", data.text); break;
    case "error":
      ready?.reject(new Error(data.message)); opened?.reject(new Error(data.message));
      ready = opened = null;
      emit("pd:print", "error: " + data.message);
      break;
    case "recv-float": emit("pd:float", data); break;
  }
}

/** Create the AudioContext and libpd. Must follow a user gesture (autoplay rules). */
export function boot() {
  booting ??= (async () => {
    ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule(WORKLET);
    node = new AudioWorkletNode(ctx, "libpd", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers",
    });
    node.port.onmessage = onMessage;
    master = ctx.createGain();
    master.gain.value = 0.7;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    node.connect(master).connect(analyser);
    master.connect(ctx.destination);
    await new Promise((resolve, reject) => { ready = { resolve, reject }; });
  })().catch(e => { booting = null; throw e; });
  return booting;
}

/** (Re)load the patch text. Receivers bound with bind() survive reloads. */
export async function load(text, extra = []) {
  await boot();
  const p = new Promise((resolve, reject) => { opened = { resolve, reject }; });
  node.port.postMessage({ type: "load", files: [{ path: "main.pd", content: text }, ...extra], openPath: "main.pd" });
  return p;
}

export async function play() { await boot(); await ctx.resume(); emit("pd:state"); }
export async function pause() { if (ctx) await ctx.suspend(); emit("pd:state"); }

export function setBinds(names) {
  if (!node) { binds.clear(); names.forEach(n => binds.add(n)); return; }
  for (const r of binds) if (!names.has(r)) node.port.postMessage({ type: "unbind", receiver: r });
  for (const r of names) if (!binds.has(r)) node.port.postMessage({ type: "bind", receiver: r });
  binds.clear(); names.forEach(n => binds.add(n));
}
export const sendFloat = (receiver, value) => node?.port.postMessage({ type: "float", receiver, value });
export const sendBang = receiver => node?.port.postMessage({ type: "bang", receiver });
export const setVolume = v => { if (master) master.gain.value = v; };

async function drumLoop() {
  drumBuffer ??= (async () => {
    const response = await fetch(DRUM_LOOP);
    if (!response.ok) throw new Error("Couldn't load the drum loop");
    return ctx.decodeAudioData(await response.arrayBuffer());
  })().catch(error => { drumBuffer = null; throw error; });
  return drumBuffer;
}

/** Input source: none | drums | tone | mic | file. Shared across all patches. */
export async function setInput(kind, file) {
  await boot();
  const change = ++inputChange;
  let startBuffer = false;
  if (input) { try { input.stop?.(); } catch { /* already stopped */ } input.disconnect(); input = null; }
  if (stream && kind !== "mic") { stream.getTracks().forEach(t => t.stop()); stream = null; }
  inputKind = kind;
  if (kind === "tone") {
    // a slow saw chord: harmonically rich, so filters and delays have something to chew on
    const mix = ctx.createGain(); mix.gain.value = 0.15;
    const oscs = [110, 165, 220.5].map(f => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(mix); o.start(); return o; });
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.5; depth.gain.value = 0.12; lfo.connect(depth).connect(mix.gain); lfo.start();
    mix.stop = () => { oscs.forEach(o => o.stop()); lfo.stop(); };
    input = mix;
  } else if (kind === "mic") {
    const mic = stream ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (change !== inputChange) { if (mic !== stream) mic.getTracks().forEach(t => t.stop()); return; }
    stream = mic;
    input = ctx.createMediaStreamSource(stream);
  } else if (kind === "drums" || (kind === "file" && file)) {
    const buf = kind === "drums" ? await drumLoop() : await ctx.decodeAudioData(await file.arrayBuffer());
    if (change !== inputChange) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    input = src;
    startBuffer = true;
  }
  input?.connect(node);
  if (startBuffer) input.start();
  emit("pd:state");
}
export const inputSource = () => inputKind;
