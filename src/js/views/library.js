// Library tab.
import { on, emit } from "../state.js";
import { parseSyx, toSyx, hex8 } from "../protocol.js";
import { $, esc, fmtSize, safeName, toast, confirmBox, saveFile } from "../util.js";
import * as Lib from "../library.js";
import { stage } from "./patches.js";

async function render() {
  let items;
  try { items = await Lib.all(); }
  catch (e) { $("#libRows").innerHTML = `<tr><td colspan=5 class="empty">Browser storage is unavailable here (${esc(e.message)}).</td></tr>`; return; }
  items.sort((a, b) => b.added - a.added);
  $("#libRows").innerHTML = items.length ? items.map(it => `<tr data-id="${it.id}">
      <td><span class="name">${esc(it.name)}</span><div class="lib-meta mono">${hex8(it.crc)} · ${esc(it.source || "")}</div></td>
      <td><span class="tag ${it.kind === "patch" ? "red" : ""}">${it.kind}</span></td>
      <td class="mono">${fmtSize(it.size)}</td>
      <td class="muted crc" style="font-size:13px">${new Date(it.added).toLocaleDateString()}</td>
      <td class="acts"><button class="btn sm" data-act="stage">Send…</button>
        <button class="btn ghost sm" data-act="syx" title="Export .syx">.syx</button>
        <button class="btn ghost sm" data-act="bin" title="Export raw binary">.bin</button>
        <button class="btn ghost sm" data-act="ren" title="Rename">✎</button>
        <button class="btn ghost sm danger" data-act="del" title="Remove from library">✕</button></td></tr>`).join("")
    : `<tr><td colspan=5 class="empty">Nothing here yet. Download patches from the Lich, use “Back up all”, or add files.</td></tr>`;
}

async function onAction(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const id = +b.closest("tr").dataset.id;
  const it = (await Lib.all()).find(x => x.id === id);
  if (!it) return;
  const data = new Uint8Array(it.data);
  switch (b.dataset.act) {
    case "stage": stage(data, { file: it.name + (it.kind === "patch" ? ".syx" : ""), crcOk: true }); emit("tab", "patches"); break;
    case "syx": saveFile(toSyx(data), safeName(it.name) + ".syx"); break;
    case "bin": saveFile(data, safeName(it.name) + ".bin"); break;
    case "ren": { const n = prompt("Library name", it.name); if (n) { it.name = n; await Lib.put(it); render(); } break; }
    case "del":
      if (await confirmBox("Remove from library?", `"${it.name}" will be deleted from this browser.`, "Remove")) { await Lib.del(id); render(); }
      break;
  }
}

export function initLibrary() {
  $("#libRows").addEventListener("click", onAction);
  $("#libAdd").onclick = () => $("#libFile").click();
  $("#libFile").onchange = async e => {
    for (const f of e.target.files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      try { await Lib.add(/\.syx$/i.test(f.name) || bytes[0] === 0xF0 ? parseSyx(bytes).data : bytes, "file", f.name); }
      catch (err) { toast(f.name + ": " + err.message, "err"); }
    }
    e.target.value = "";
  };
  on("library", render);
  on("tab", t => { if (t === "library") render(); });
}
