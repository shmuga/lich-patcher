// node --test tests/   (uses the .syx files elsewhere in ~/Projects/lich when present)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { d2s, s2d, encInt, decInt, crc32, parseSyx, toSyx, inspect, uploadMessages, describe, CMD, sx, SEG_BITS } from "../src/js/protocol.js";

const root = new URL("../../", import.meta.url);
const file = p => new URL(p, root);

test("7-bit packing round trips", () => {
  const data = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 255);
  assert.deepEqual(s2d(d2s(data)), data);
  for (const v of [0, 1, 0x7f, 0x80, 0xDADAC0DE, 0xFFFFFFFF]) assert.equal(decInt(encInt(v)), v);
});

test("packet decoding handles all high bits and partial packet boundaries", () => {
  assert.deepEqual(s2d([0b1010101, 0, 1, 2, 3, 4, 5, 6]),
    Uint8Array.from([128, 1, 130, 3, 132, 5, 134]));
  assert.deepEqual(s2d([0b0000010, 127, 127, 0b0000000, 0, 0, 0, 0, 0b1, 42]),
    Uint8Array.from([127, 255, 0, 0, 0, 0, 0, 170]));
  for (let size = 0; size <= 256; size++) {
    const data = Uint8Array.from({ length: size }, (_, i) => i);
    assert.deepEqual(s2d(d2s(data)), data);
  }
  assert.deepEqual(s2d([127]), new Uint8Array());
});

test("display glyphs retain the hardware's bit layout including its open-bottom 9", () => {
  assert.deepEqual(SEG_BITS, [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07,
    0x7f, 0x67, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71, 0x00, 0x3e, 0x38]);
});

test("crc32 matches zlib", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
});

test("upload stream: size header, 240-byte packets, crc trailer", () => {
  const data = new Uint8Array(500).fill(0xAA);
  const msgs = uploadMessages(data);
  assert.equal(msgs.length, 1 + 3 + 1);
  assert.equal(msgs[1].length, 4 + 5 + 240 + 1);
  assert.deepEqual(parseSyx(new Uint8Array(msgs.flat())).data, data);
});

for (const p of ["tiny-machine-lich/Tiny.syx", "seearms-lich/Seearms.syx"]) {
  test(`byte-identical to FirmwareSender: ${p}`, { skip: !existsSync(file(p)) }, () => {
    const bytes = new Uint8Array(readFileSync(file(p)));
    const r = parseSyx(bytes);
    assert.ok(r.crcOk);
    assert.equal(inspect(r.data).kind, "patch");
    assert.deepEqual(toSyx(r.data), bytes);
  });
}

test("firmware images are recognisable by their FLASH trailer", { skip: !existsSync(file("Lich3-v22.5.0-usbtx-fix3.syx")) }, () => {
  const r = parseSyx(new Uint8Array(readFileSync(file("Lich3-v22.5.0-usbtx-fix3.syx"))));
  assert.equal(inspect(r.data).kind, "resource");
  assert.equal(r.trailer.cmd, CMD.FLASH);
});

test("describe flags an erase with no slot", () => {
  assert.match(describe(Uint8Array.from(sx(CMD.ERASE))), /ALL/);
});
