// OWL / OpenWare MIDI protocol. Pure functions only: no DOM, no state.
// Wire-format references: Rebel Technology's OpenWare (GPL-2.0),
// Source/OpenWareMidiControl.h, FirmwareLoader.hpp and MidiController.cpp.
// https://github.com/RebelTechnology/OpenWare — see CREDITS.md.

export const OMNI = 0x52, MFR = 0x7d;
export const CMD = {
  PRESET_NAME: 0x01, PARAM_NAME: 0x02, CONFIG: 0x03, RESOURCE_NAME: 0x04, RESET: 0x7d,
  UPLOAD: 0x10, STORE: 0x11, RUN: 0x12, FLASH: 0x13, ERASE: 0x14, SAVE: 0x17, SEND: 0x18,
  FW_VERSION: 0x20, DEVICE_ID: 0x21, PROGRAM_MESSAGE: 0x22, DEVICE_STATS: 0x23, PROGRAM_STATS: 0x24,
  BOOT_VERSION: 0x25, PROGRAM_ERROR: 0x30,
};
// CC26 (PATCH_CONTROL) is deliberately absent: on the Lich it stops/starts the ADC from the
// USB interrupt, which can hang the module, and A–D are rewritten from the ADC every block anyway.
export const CC = { BUTTON_ON: 27, BUTTON_OFF: 28, REQUEST: 67, PUSHBUTTON: 1 };
export const MAX_PATCHES = 40;          // device.h MAX_NUMBER_OF_PATCHES
export const PATCH_MAGIC = 0xDADAC0DE;  // ProgramHeader.magic
export const DATA_PER_PACKET = 210;     // 240 encoded bytes, same as FirmwareSender
export const HW_PARAMS = 4;             // A–D come from the panel/CV on the Lich

export const PNAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
for (const g of "ABCD") for (const p of "ABCDEFGH") PNAMES.push(g + p);
export const paramCC = id => id < 5 ? 20 + id : id === 5 ? 1 : id === 6 ? 12 : id === 7 ? 13 : 75 + (id - 8);
export const LICH_PARAM_NOTE = { 5: "CV out 1", 6: "CV out 2" };

/* 8-bit <-> 7-bit SysEx packing: one MSB byte followed by up to 7 data bytes */
export function d2s(d) {
  const o = [];
  for (let i = 0; i < d.length; i += 7) {
    const c = d.slice(i, i + 7);
    let m = 0;
    c.forEach((b, j) => m |= (b >> 7) << j);
    o.push(m, ...Array.from(c, b => b & 0x7f));
  }
  return o;
}
export function s2d(s) {
  // A high-bit bitmap precedes up to seven low-bit bytes in each packet.
  // Decode by packet and bit position, independently of firmware's decoder.
  const o = new Uint8Array(s.length - Math.ceil(s.length / 8));
  let out = 0;
  for (let packet = 0; packet < s.length; packet += 8) {
    const count = Math.min(7, s.length - packet - 1);
    for (let bit = 0; bit < count; bit++) {
      o[out++] = s[packet + bit + 1] + ((s[packet] & (2 ** bit)) ? 128 : 0);
    }
  }
  return o;
}
export const encInt = v => d2s([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
export const decInt = s => { const b = s2d(s.slice(0, 5)); return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; };

const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(d) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export const sx = (cmd, payload = []) => [0xF0, MFR, OMNI, cmd, ...payload, 0xF7];
export function ascii(b) { let s = ""; for (const c of b) { if (!c) break; s += String.fromCharCode(c); } return s; }
export const hex8 = n => n.toString(16).toUpperCase().padStart(8, "0");

/* Upload stream: index 0 = size, data packets, then CRC (FirmwareLoader::handleFirmwareUpload) */
export function uploadMessages(data) {
  const msgs = [sx(CMD.UPLOAD, [...encInt(0), ...encInt(data.length)])];
  let idx = 1;
  for (let off = 0; off < data.length; off += DATA_PER_PACKET)
    msgs.push(sx(CMD.UPLOAD, [...encInt(idx++), ...d2s(data.subarray(off, off + DATA_PER_PACKET))]));
  msgs.push(sx(CMD.UPLOAD, [...encInt(idx), ...encInt(crc32(data))]));
  return msgs;
}
export const toSyx = data => new Uint8Array(uploadMessages(data).flat());
export const saveMessage = name => sx(CMD.SAVE, [...Array.from(name, c => c.charCodeAt(0) & 127), 0]);

export function splitSysex(bytes) {
  const out = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xF0) start = i;
    else if (bytes[i] === 0xF7 && start >= 0) { out.push(bytes.subarray(start, i + 1)); start = -1; }
  }
  return out;
}

/* Parse a FirmwareSender .syx: payload, CRC check and any trailing command */
export function parseSyx(bytes) {
  const msgs = splitSysex(bytes);
  if (!msgs.length) throw new Error("No SysEx messages in file");
  let size = null, len = 0, crc = null, trailer = null;
  const chunks = [];
  for (const m of msgs) {
    if (m[1] !== MFR) continue;
    const cmd = m[3], body = m.subarray(4, m.length - 1);
    if (cmd === CMD.UPLOAD) {
      const idx = decInt(body), rest = body.subarray(5);
      if (idx === 0) size = decInt(rest);
      else if (size != null && len < size) { const d = s2d(rest); chunks.push(d); len += d.length; }
      else crc = decInt(rest);
    } else trailer = { cmd, body };
  }
  if (size == null) throw new Error("Not an OWL upload: no size header");
  const data = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { data.set(c, o); o += c.length; }
  if (len !== size) throw new Error(`Truncated: expected ${size} bytes, got ${len}`);
  return { data, crcOk: crc === crc32(data), trailer };
}

/* What is this binary? Patches start with a ProgramHeader (magic, 6 pointers, 24-char name). */
export function inspect(data, fileName) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const isPatch = data.length >= 52 && dv.getUint32(0, true) === PATCH_MAGIC;
  const name = isPatch ? ascii(data.subarray(28, 52)) : (fileName || "resource").replace(/\.[^.]+$/, "").slice(0, 15);
  return { kind: isPatch ? "patch" : "resource", name, size: data.length, crc: crc32(data) };
}

/* Incoming message helpers */
export const isOwlSysex = m => m[0] === 0xF0 && m[1] === MFR && (m[2] === OMNI || (m[2] & 0xF0) === 0x20);
export function parseName(b) {
  // [index, name..., 0, size(5), crc(5)]  (MidiController::sendName)
  let i = 1;
  while (i < b.length && b[i]) i++;
  return { index: b[0], name: ascii(b.subarray(1, i)), size: decInt(b.subarray(i + 1, i + 6)), crc: decInt(b.subarray(i + 6, i + 11)) };
}

const CMD_NAMES = Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k]));
const REQ_NAMES = { 0: "device info", 127: "device info", 1: "patch names", 3: "settings", 4: "resource names", 0x20: "firmware", 0x21: "device id", 0x22: "program message", 0x23: "device stats", 0x24: "program stats", 0x25: "bootloader" };
const TEXT_CMDS = [0x03, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x30];

/* Human readable one-liner for the monitor */
export function describe(m) {
  const st = m[0] & 0xF0, ch = (m[0] & 15) + 1;
  if (m[0] === 0xF0) {
    const cmd = m[3], name = CMD_NAMES[cmd] || "0x" + (cmd ?? 0).toString(16);
    const b = m.subarray(4, m.length - 1);
    if (cmd === CMD.UPLOAD) return `SysEx ${name} #${decInt(b)} (${m.length} bytes)`;
    if (TEXT_CMDS.includes(cmd)) return `SysEx ${name} "${ascii(b)}"`;
    if (cmd === CMD.PRESET_NAME || cmd === CMD.RESOURCE_NAME) { const n = parseName(b); return `SysEx ${name} [${n.index}] "${n.name}"`; }
    if (cmd === CMD.PARAM_NAME) return `SysEx ${name} ${PNAMES[b[0]] || b[0]} "${ascii(b.subarray(1))}"`;
    if (cmd === CMD.STORE || cmd === CMD.ERASE || cmd === CMD.SEND) return `SysEx ${name} slot ${b.length >= 5 ? decInt(b) : "ALL"}`;
    return `SysEx ${name} (${m.length} bytes)`;
  }
  if (st === 0xB0) {
    const cc = m[1], v = m[2];
    if (cc === CC.REQUEST) return `CC ${cc} request ${REQ_NAMES[v] || v}`;
    if (cc >= 20 && cc <= 24) return `CC ${cc} param ${PNAMES[cc - 20]} = ${v}`;
    if (cc === CC.BUTTON_ON || cc === CC.BUTTON_OFF) return `CC ${cc} button ${v} ${cc === CC.BUTTON_ON ? "on" : "off"}`;
    return `CC ${cc} = ${v}  ch${ch}`;
  }
  if (st === 0xC0) return `Program ${m[1]}`;
  if (st === 0x90) return `Note on ${m[1]} vel ${m[2]}  ch${ch}`;
  if (st === 0x80) return `Note off ${m[1]}  ch${ch}`;
  if (st === 0xE0) return `Pitch bend ${(m[1] | (m[2] << 7)) - 8192}  ch${ch}`;
  return Array.from(m.slice(0, 3), x => x.toString(16).padStart(2, "0")).join(" ");
}

/* Glyph geometry: a=top, b/c=right, d=bottom, e/f=left, g=middle.
 * The hardware's 9 omits the bottom segment. Behaviour reference:
 * OpenWare/Lich3/Core/Src/Lich.cpp; this generates bits from segment names. */
export const SEG_BITS = [
  "abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc",
  "abcdefg", "abcfg", "abcefg", "cdefg", "adef", "bcdeg", "adefg", "aefg",
  "", "bcdef", "def",
].map(glyph => [...glyph].reduce((bits, segment) => bits + 2 ** (segment.charCodeAt(0) - 97), 0));
export const SEG = { E: 14, BLANK: 16, U: 17, L: 18 };
