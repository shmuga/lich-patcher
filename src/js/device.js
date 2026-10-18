// Device model: turns incoming MIDI into state, and wraps the OWL operations
// (names, settings, download, upload, store, erase, buttons) as async functions.
import { S, on, emit, log } from "./state.js";
import { CMD, CC, MAX_PATCHES, sx, encInt, decInt, s2d, crc32, ascii, parseName, isOwlSysex, uploadMessages, saveMessage } from "./protocol.js";
import { send, sendCC, request, bgRequest, enqueue, waitQuiet, markDone } from "./midi.js";
import { sleep, toast } from "./util.js";

/* ───────── incoming ───────── */
on("rx", m => {
  const st = m[0] & 0xF0;
  let poll = false;
  if (isOwlSysex(m)) poll = onSysex(m[3], m.subarray(4, m.length - 1));
  else if (st === 0xC0) poll = onProgram(m[1]);
  else if (st === 0xB0) {
    const cc = m[1], v = m[2];
    if (cc >= 20 && cc <= 24) { setParam(cc - 20, v); poll = true; }
    else if (cc === CC.PUSHBUTTON) { S.buttons[4] = v > 63; emit("buttons"); poll = true; }
  }
  log("in", m, poll);
});

function onProgram(idx) {
  const prev = S.prog;
  S.prog = idx;
  if (S.sel == null || S.sel === prev) S.sel = idx;
  markDone("pc");
  if (prev !== idx) {
    S.mode = "run"; S.error = "";
    if (prev != null) S.params.forEach(p => p.name = null);   // new patch: names will be re-announced
    emit("patches"); emit("params"); emit("stats");
  }
  emit("seg");
  return prev === idx;
}

function onSysex(cmd, b) {
  switch (cmd) {
    case CMD.PRESET_NAME: case CMD.RESOURCE_NAME: {
      const n = parseName(b);
      (cmd === CMD.PRESET_NAME ? S.patches : S.resources).set(n.index, n);
      emit("patches");
      return false;
    }
    case CMD.PARAM_NAME: {
      const pid = b[0], p = S.params.get(pid) || { value: null };
      p.name = ascii(b.subarray(1)); S.params.set(pid, p);
      emit("params");
      return false;
    }
    case CMD.CONFIG: {
      const t = ascii(b);
      S.config[t.slice(0, 2)] = parseInt(t.slice(2), 16) >>> 0;
      emit("config");
      return true;
    }
    case CMD.UPLOAD: rxPacket(b); return false;
    case CMD.FW_VERSION: S.fw = ascii(b); emit("device"); return false;
    case CMD.BOOT_VERSION: S.boot = ascii(b); emit("device"); return false;
    case CMD.DEVICE_ID: S.id = ascii(b); emit("device"); return false;
    case CMD.DEVICE_STATS: {
      const m = ascii(b).match(/Storage (\d+)\/(\d+)/);
      if (m) S.storage = [+m[1], +m[2]];
      emit("stats");
      return true;
    }
    case CMD.PROGRAM_STATS: {
      // only sent while there is no error (MidiController::sendStatus)
      const t = ascii(b), c = t.match(/CPU:\s*(\d+)%/), mem = t.match(/(?:Memory|Heap):\s*(\d+)/);
      S.cpu = c ? +c[1] : null; S.mem = mem ? +mem[1] : null;
      if (S.mode === "error") { S.mode = "run"; S.error = ""; emit("seg"); }
      emit("stats");
      return true;
    }
    case CMD.PROGRAM_MESSAGE: S.msg = ascii(b); emit("msg"); emit("device"); return false;
    case CMD.PROGRAM_ERROR:
      S.error = ascii(b); S.mode = "error";
      emit("seg"); emit("stats"); emit("error", S.error);
      if (rx) rx.fail(new Error(S.error));
      return false;
  }
  return false;
}

export function setParam(pid, v) {
  const p = S.params.get(pid) || { name: null };
  p.value = v; S.params.set(pid, p);
  emit("param", pid);
}

/* ───────── requests ───────── */
export async function refreshAll() {
  request(127);                 // firmware, bootloader, program message, stats (sent immediately)
  request(CMD.DEVICE_ID);
  await refreshNames();
  await bgRequest(CMD.CONFIG);
}
export async function refreshNames() {
  S.patches.clear(); S.resources.clear(); emit("patches");
  await bgRequest(CMD.PRESET_NAME, { until: "pc", maxMs: 6000 });   // list ends with a program change
  await bgRequest(CMD.RESOURCE_NAME);
}

/* Polling: settings also carry program, A–E and the pushbutton (SendSettingsTask case 0) */
let pollN = 0;
setInterval(() => {
  if (!S.out || !S.live || S.jobs || document.hidden) return;
  pollN++;
  bgRequest(CMD.CONFIG, { quiet: true, quietMs: 200, maxMs: 800 });
  if (pollN % 2 === 0) request(CMD.PROGRAM_STATS, true);
  if (pollN % 10 === 0) request(CMD.DEVICE_STATS, true);
}, 900);

/* ───────── download: 0x18 <slot>, device streams 0x10 packets back ───────── */
let rx = null;
function rxPacket(b) {
  if (!rx) return;
  const idx = decInt(b), rest = b.subarray(5);
  if (idx === 0) { rx.size = decInt(rest); rx.chunks = []; rx.len = 0; rx.kick(); return; }
  if (rx.size == null) return;
  if (rx.len < rx.size) {
    const d = s2d(rest);
    rx.chunks.push(d); rx.len += d.length; rx.kick(); rx.progress(rx.len / rx.size);
    return;
  }
  const data = new Uint8Array(rx.len);
  let o = 0;
  for (const c of rx.chunks) { data.set(c, o); o += c.length; }
  if (decInt(rest) !== crc32(data)) rx.fail(new Error("Checksum mismatch in download"));
  else rx.done(data);
}

export function fetchSlot(slot, progress = () => {}) {
  return enqueue(() => new Promise((resolve, reject) => {
    let timer;
    const end = () => { clearTimeout(timer); rx = null; };
    rx = {
      size: null, chunks: [], len: 0, progress,
      kick: () => { clearTimeout(timer); timer = setTimeout(() => rx && rx.fail(new Error("Download timed out")), 4000); },
      done: d => { end(); resolve(d); },
      fail: e => { end(); reject(e); },
    };
    rx.kick();
    send(sx(CMD.SEND, encInt(slot)));
  }));
}

/* ───────── upload ───────── */
export let pace = 4;
export const setPace = v => pace = Math.max(0, Math.min(50, +v || 0));

export function upload(data, after, progress = () => {}) {
  if (!S.out) return Promise.reject(new Error("Not connected"));
  const msgs = uploadMessages(data);
  return enqueue(async () => {
    S.mode = "load"; S.error = ""; emit("seg");
    for (let i = 0; i < msgs.length; i++) {
      if (!send(msgs[i], true)) throw new Error("Lost connection");
      if (i % 4 === 0) progress(i / msgs.length);
      if (pace) await sleep(pace); else if (i % 16 === 0) await sleep(0);
      if (S.error) throw new Error(S.error);
    }
    progress(1);
    await sleep(30);
    if (after.run) send(sx(CMD.RUN));
    else if (after.store) send(sx(CMD.STORE, encInt(after.store)));
    else if (after.save) send(saveMessage(after.save));
    // flash writes report back with a program change; give them time
    await waitQuiet({ quietMs: after.run ? 300 : 900, maxMs: 8000 });
    if (S.error) throw new Error(S.error);
    if (S.mode === "load") { S.mode = "run"; emit("seg"); }
  });
}

/* ───────── simple commands ───────── */
export function loadSlot(slot) { send([0xC0, slot]); }
export function eraseSlot(slot) {
  // Always include the slot: an ERASE with no payload wipes the whole storage.
  if (!Number.isInteger(slot) || slot < 1 || slot >= MAX_PATCHES + 12) throw new Error("Bad slot " + slot);
  send(sx(CMD.ERASE, encInt(slot)));
}
export function press(bid, down) {
  if (!S.out) return;
  sendCC(down ? CC.BUTTON_ON : CC.BUTTON_OFF, bid);
  S.buttons[bid] = down; emit("buttons");
}
export const resetDevice = () => send(sx(CMD.RESET));
export const slotLabel = slot => slot >= MAX_PATCHES ? "R" + (slot - MAX_PATCHES + 1) : String(slot);
export function itemAt(slot) { return slot >= MAX_PATCHES ? S.resources.get(slot) : S.patches.get(slot); }

on("conn", up => {
  if (up) { refreshAll(); return; }
  Object.assign(S, { fw: "", boot: "", id: "", prog: null, sel: null, mode: "run", cpu: null, mem: null, storage: null, error: "" });
  S.patches.clear(); S.resources.clear(); S.params.clear(); S.config = {};
  emit("patches"); emit("params"); emit("seg"); emit("device"); emit("stats"); emit("config");
});
on("error", msg => toast(msg, "err", 5000));
