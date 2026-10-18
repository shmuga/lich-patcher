// Shared device state plus a tiny pub/sub so the MIDI layer never imports the views.

export const S = {
  access: null, inp: null, out: null,
  fw: "", boot: "", id: "", msg: "",
  prog: null,        // program index reported by the device
  sel: null,         // slot chosen on the virtual encoder
  mode: "run",       // run | load | error (drives the 7-segment display)
  patches: new Map(), resources: new Map(), params: new Map(), config: {},
  cpu: null, mem: null, storage: null, error: "",
  buttons: {}, busy: 0, jobs: 0,  // busy = user-visible jobs, jobs = all queued (incl. polling)
  live: true, staged: null,
};

const subs = new Map();
export function on(topic, fn) {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic).add(fn);
}
export function emit(topic, arg) {
  for (const fn of subs.get(topic) || []) fn(arg);
}

/* Monitor log lives here so the I/O layer can append without knowing about the view */
export const LOG = [];
export function log(dir, m, poll) {
  LOG.push({ t: new Date(), dir, m: Uint8Array.from(m.length > 64 ? m.slice(0, 64) : m), len: m.length, poll });
  if (LOG.length > 800) LOG.splice(0, LOG.length - 800);
  emit("log");
}
