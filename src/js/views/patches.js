// Patches tab: file staging/upload, device patch + resource tables, backup.
import { S, on, emit } from "../state.js";
import { CMD, MAX_PATCHES, parseSyx, inspect, toSyx, decInt, hex8 } from "../protocol.js";
import { $, $$, esc, fmtSize, safeName, toast, confirmBox, saveFile, setProgress } from "../util.js";
import { upload, fetchSlot, refreshNames, loadSlot, eraseSlot, slotLabel, itemAt } from "../device.js";
import { request } from "../midi.js";
import * as Lib from "../library.js";

/* ───────── staging ───────── */
export async function stageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let data, crcOk = true, trailer = null, fromSyx = false;
  try {
    if (/\.syx$/i.test(file.name) || bytes[0] === 0xF0) { ({ data, crcOk, trailer } = parseSyx(bytes)); fromSyx = true; }
    else data = bytes;
  } catch (e) { toast(file.name + ": " + e.message, "err", 6000); return; }
  stage(data, { file: file.name, crcOk, trailer, fromSyx });
}

export function stage(data, meta) {
  const info = inspect(data, meta.file);
  const t = meta.trailer;
  const firmware = info.kind !== "patch" && t?.cmd === CMD.FLASH;
  S.staged = { data, info, meta, firmware };
  const asks = t ? ({ [CMD.STORE]: "store in slot " + decInt(t.body), [CMD.RUN]: "run", [CMD.FLASH]: "flash firmware", [CMD.SAVE]: "save resource" }[t.cmd] || "0x" + t.cmd.toString(16)) : null;
  const crcTag = meta.fromSyx ? (meta.crcOk ? '<span class="tag ok">verified</span>' : '<span class="tag red">mismatch</span>') : "";
  $("#stagedInfo").innerHTML = `
    <dt>Name</dt><dd class="name">${esc(info.name)} <span class="tag ${info.kind === "patch" ? "red" : ""}">${firmware ? "firmware" : info.kind}</span></dd>
    <dt>File</dt><dd>${esc(meta.file || "")}</dd>
    <dt>Size</dt><dd>${fmtSize(info.size)} <span class="faint mono">${info.size} bytes</span></dd>
    <dt>CRC32</dt><dd class="mono">${hex8(info.crc)} ${crcTag}</dd>
    ${asks ? `<dt>File asks to</dt><dd>${esc(asks)}</dd>` : ""}`;
  $("#staged").classList.add("on");
  const isPatch = info.kind === "patch";
  for (const id of ["#runBtn", "#storeBtn"]) $(id).classList.toggle("hidden", !isPatch);
  $("#slotSel").parentElement.classList.toggle("hidden", !isPatch);
  for (const id of ["#resNameField", "#saveResBtn"]) $(id).classList.toggle("hidden", isPatch);
  $("#resName").value = info.name;
  $$("#stagedActions .btn").forEach(b => b.disabled = firmware || (meta.fromSyx && !meta.crcOk && b.id !== "stageToLib"));
  if (firmware) toast("That's a firmware image. Flash it with the official firmware updater, not here.", "warn", 6000);
  delete $("#slotSel").dataset.user;
  fillSlotSel(t?.cmd === CMD.STORE ? decInt(t.body) : null);
}

function fillSlotSel(want) {
  const sel = $("#slotSel");
  const cur = sel.dataset.user ? +sel.value : null;
  let opts = "";
  for (let i = 1; i <= MAX_PATCHES; i++) {
    const p = S.patches.get(i);
    opts += `<option value="${i}">${i} · ${p ? esc(p.name) : "empty"}</option>`;
  }
  sel.innerHTML = opts;
  let first = 1;
  while (S.patches.has(first) && first < MAX_PATCHES) first++;
  sel.value = want || cur || first;
}

async function doUpload(after) {
  const bar = $("#upProg");
  try {
    await upload(S.staged.data, after, f => setProgress(bar, f));
    toast(after.run ? "Running on the Lich" : after.store ? `Stored in slot ${after.store}` : `Saved resource "${after.save}"`);
    if (after.run) request(127, true); else await refreshNames();
  } catch (e) {
    toast("Upload failed: " + e.message, "err", 6000);
  } finally { setProgress(bar, null); }
}

/* ───────── tables ───────── */
// Firmware-owned resources such as __SETTINGS__ (calibration, MIDI channels): never offer to erase them
const isSystem = r => /^__.*__$/.test(r.name);

function render() {
  const empty = msg => `<tr><td colspan=5 class="empty">${msg}</td></tr>`;
  const rows = [...S.patches.values()].sort((a, b) => a.index - b.index);
  $("#patchRows").innerHTML = rows.length ? rows.map(p => {
    const i = p.index, cur = i === S.prog;
    return `<tr data-slot="${i}" class="${cur ? "cur" : ""}">
      <td class="slot">${i === 0 ? "RAM" : i}</td>
      <td><span class="name">${esc(p.name)}</span>${cur ? '<span class="tag red">playing</span>' : ""}</td>
      <td class="mono muted">${fmtSize(p.size)}</td><td class="mono faint crc">${i === 0 ? "–" : hex8(p.crc)}</td>
      <td class="acts">${cur || i === 0 ? "" : `<button class="btn sm" data-act="load">Load</button>`}
        ${i === 0 ? "" : `<button class="btn ghost sm" data-act="dl" title="Download .syx">↓ .syx</button>
        <button class="btn ghost sm" data-act="lib" title="Copy to library">+ Lib</button>
        <button class="btn ghost sm danger" data-act="erase" title="Erase this slot">✕</button>`}</td></tr>`;
  }).join("") : empty(S.out ? "Reading patches…" : "Connect the Lich to see its patches.");

  const res = [...S.resources.values()].sort((a, b) => a.index - b.index);
  $("#resRows").innerHTML = res.length ? res.map(r => `<tr data-slot="${r.index}">
      <td class="slot">${r.index - MAX_PATCHES + 1}</td><td><span class="name">${esc(r.name)}</span>${isSystem(r) ? '<span class="tag">system</span>' : ""}</td>
      <td class="mono muted">${fmtSize(r.size)}</td><td class="mono faint crc">${hex8(r.crc)}</td>
      <td class="acts"><button class="btn ghost sm" data-act="dlr">↓ .bin</button><button class="btn ghost sm" data-act="lib">+ Lib</button>
        ${isSystem(r) ? "" : '<button class="btn ghost sm danger" data-act="erase">✕</button>'}</td></tr>`).join("")
    : empty(S.out ? "No resources stored." : "–");
  if (S.staged) fillSlotSel();
}

async function slotAction(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const slot = +b.closest("tr").dataset.slot, act = b.dataset.act, item = itemAt(slot);
  if (!item) return;
  if (act === "load") { loadSlot(slot); S.sel = slot; emit("seg"); return; }
  if (act === "erase") {
    if (slot >= MAX_PATCHES && isSystem(item)) return;
    const what = slot >= MAX_PATCHES ? "resource" : "slot " + slot;
    if (!await confirmBox(`Erase ${what}?`, `"${item.name}" will be deleted from the Lich's flash. Back it up first if you want to keep it.`, "Erase")) return;
    eraseSlot(slot);
    toast(`Erasing "${item.name}"…`);
    setTimeout(refreshNames, 1500);
    return;
  }
  const bar = $("#dlProg");
  try {
    const data = await fetchSlot(slot, f => setProgress(bar, f));
    if (act === "dl") saveFile(toSyx(data), safeName(item.name) + ".syx");
    if (act === "dlr") saveFile(data, safeName(item.name) + ".bin");
    if (act === "lib") await Lib.add(data, "slot " + slotLabel(slot), item.name);
  } catch (err) { toast(err.message, "err"); }
  finally { setProgress(bar, null); }
}

async function backupAll() {
  if (!S.out) return toast("Not connected", "warn");
  const slots = [...S.patches.keys()].filter(i => i > 0).concat([...S.resources.keys()]);
  const bar = $("#dlProg");
  let n = 0;
  for (const [k, slot] of slots.entries()) {
    const item = itemAt(slot);
    try {
      const d = await fetchSlot(slot, f => setProgress(bar, (k + f) / slots.length));
      if (await Lib.add(d, "backup slot " + slotLabel(slot), item.name)) n++;
    } catch (e) { toast(`${item.name}: ${e.message}`, "err"); }
  }
  setProgress(bar, null);
  toast(`Backed up ${n} new of ${slots.length} items`);
}

export function initPatches() {
  const drop = $("#drop");
  drop.onclick = () => $("#fileIn").click();
  $("#fileIn").onchange = e => { if (e.target.files[0]) stageFile(e.target.files[0]); e.target.value = ""; };
  let depth = 0;
  document.addEventListener("dragenter", e => { e.preventDefault(); depth++; drop.classList.add("over"); });
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; drop.classList.remove("over"); } });
  // runs before the editor's .pd handler, which stops the drop from reaching us
  document.addEventListener("drop", () => { depth = 0; drop.classList.remove("over"); }, true);
  document.addEventListener("drop", e => {
    e.preventDefault(); depth = 0; drop.classList.remove("over");
    const f = e.dataTransfer?.files?.[0];
    if (f) { emit("tab", "patches"); stageFile(f); }
  });

  $("#unstage").onclick = () => { S.staged = null; $("#staged").classList.remove("on"); };
  $("#slotSel").onchange = e => e.target.dataset.user = "1";
  $("#runBtn").onclick = () => doUpload({ run: true });
  $("#storeBtn").onclick = async () => {
    const slot = +$("#slotSel").value, cur = S.patches.get(slot);
    if (cur && !await confirmBox(`Replace slot ${slot}?`, `"${cur.name}" is stored there. It will be overwritten by "${S.staged.info.name}".`, "Replace")) return;
    doUpload({ store: slot });
  };
  $("#saveResBtn").onclick = () => {
    const n = $("#resName").value.trim();
    if (!n || n.length > 15) return toast("Resource names are 1–15 characters", "warn");
    doUpload({ save: n });
  };
  $("#stageToLib").onclick = () => Lib.add(S.staged.data, "file", S.staged.meta.file);

  $("#patchRows").addEventListener("click", slotAction);
  $("#resRows").addEventListener("click", slotAction);
  $("#refreshBtn").onclick = () => S.out ? refreshNames() : toast("Not connected", "warn");
  $("#backupBtn").onclick = backupAll;

  on("patches", render);
  on("conn", render);
  render();
}
