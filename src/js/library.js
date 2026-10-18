// Patch library kept in IndexedDB (per browser, offline).
import { inspect } from "./protocol.js";
import { emit } from "./state.js";
import { toast } from "./util.js";

let dbp = null;
function open() {
  return dbp ||= new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open("lich-patcher", 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction("items", mode);
    const req = fn(t.objectStore("items"));
    t.oncomplete = () => res(req.result);
    t.onerror = () => rej(t.error);
  });
}
export const all = () => tx("readonly", s => s.getAll());
export const put = item => tx("readwrite", s => s.put(item));
export const del = id => tx("readwrite", s => s.delete(id));

export async function add(data, source, nameHint) {
  const info = inspect(data, nameHint);
  try {
    const dup = (await all()).find(x => x.crc === info.crc && x.size === info.size);
    if (dup) { toast(`"${dup.name}" is already in the library`); return false; }
    await put({ ...info, data, source, added: Date.now() });
    emit("library");
    toast(`Added "${info.name}" to the library`);
    return true;
  } catch (e) { toast("Library unavailable: " + e.message, "err"); return false; }
}
