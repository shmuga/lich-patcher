// Web MIDI transport: port discovery, sending, and a serial queue for device requests.
import { S, emit, log } from "./state.js";
import { CC } from "./protocol.js";
import { toast } from "./util.js";

export const NO_MIDI = "This browser has no Web MIDI. Use Chrome, Edge, Opera or Brave on desktop. Safari doesn't support it.";
const looksLikeOwl = p => /owl|lich/i.test(p.name || "");

export function send(bytes, quiet = false) {
  if (!S.out) return false;
  try { S.out.send(bytes); }
  catch (e) { toast("MIDI send failed: " + e.message, "err"); return false; }
  log("out", bytes, quiet);
  return true;
}
export const sendCC = (cc, v, quiet) => send([0xB0, cc, v & 127], quiet);
export const request = (v, quiet) => sendCC(CC.REQUEST, v, quiet);

/* Serial job queue. The firmware answers several requests from a single background task slot
   (MidiController -> owl.setBackgroundTask): a new request silently cancels the one running.
   So anything that streams back (names, settings, downloads, uploads) goes through here. */
let chain = Promise.resolve();
export function enqueue(job, { quiet = false } = {}) {
  const p = chain.then(async () => {
    S.jobs++; if (!quiet) { S.busy++; emit("busy"); }
    try { return await job(); }
    finally { S.jobs--; if (!quiet) { S.busy--; emit("busy"); } }
  });
  chain = p.catch(() => {});
  return p;
}

/* Listeners that want to know about every incoming message (quiet-period detection) */
const waiters = new Set();
export function waitQuiet({ quietMs = 350, maxMs = 4000, until = null } = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const w = { last: t0, until, done: false };
    waiters.add(w);
    const iv = setInterval(() => {
      const now = performance.now();
      if (w.done || now - w.last > quietMs || now - t0 > maxMs) { clearInterval(iv); waiters.delete(w); resolve(); }
    }, 40);
  });
}
/* Called by the device layer, e.g. markDone("pc") when the program change that ends a name list arrives */
export function markDone(what) { for (const w of waiters) if (w.until === what) w.done = true; }

/* Request something the device answers from its background task, and wait until it goes quiet */
export function bgRequest(value, opts = {}) {
  return enqueue(async () => {
    if (!S.out) return;
    const done = waitQuiet(opts);
    request(value, opts.quiet);
    await done;
  }, { quiet: opts.quiet });
}

function onMessage(ev) {
  for (const w of waiters) w.last = performance.now();
  emit("rx", ev.data);
}

export async function connect() {
  if (!navigator.requestMIDIAccess) { emit("nomidi", NO_MIDI); return; }
  try { S.access = await navigator.requestMIDIAccess({ sysex: true }); }
  catch (e) { emit("nomidi", `MIDI access was refused (${e.message}). Allow MIDI and SysEx for this page in the browser's site settings, then reload.`); return; }
  S.access.onstatechange = () => {
    emit("ports");
    if (S.inp && S.inp.state === "disconnected") detach("Lich disconnected");
    else if (!S.inp) autoAttach(false);
  };
  emit("ports");
  autoAttach(true);
}

export function autoAttach(explicit) {
  const outs = [...S.access.outputs.values()];
  const out = outs.find(o => looksLikeOwl(o) && o.state !== "disconnected");
  if (out) return attach(out);
  if (explicit) toast(outs.length ? "No OWL-LICH port found. Pick the port from the menu." : "No MIDI devices. Plug the Lich in over USB (the square USB-B port).", "warn", 5000);
}

export function attach(out) {
  const ins = [...S.access.inputs.values()];
  const inp = ins.find(i => i.name === out.name) || ins.find(looksLikeOwl);
  if (!inp) { toast("Found output " + out.name + " but no matching input", "err"); return; }
  if (S.inp) S.inp.onmidimessage = null;
  S.inp = inp; S.out = out;
  inp.onmidimessage = onMessage;
  emit("conn", true);
}

export function detach(why) {
  if (S.inp) S.inp.onmidimessage = null;
  S.inp = S.out = null;
  emit("conn", false);
  if (why) toast(why, "warn");
}
