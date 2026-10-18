// Small DOM helpers shared by the views.

export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmtSize = n => n == null ? "–" : n < 1024 ? n + " B" : (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
export const safeName = s => (s || "patch").replace(/[^\w.-]+/g, "_");

export function toast(msg, kind = "ok", ms = 3200) {
  const el = document.createElement("div");
  el.className = "toast " + (kind === "ok" ? "" : kind);
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), ms);
}

export function confirmBox(title, body, yes = "OK") {
  return new Promise(res => {
    const d = $("#dlg");
    $("#dlgT").textContent = title; $("#dlgB").textContent = body; $("#dlgYes").textContent = yes;
    const done = v => { d.close(); $("#dlgYes").onclick = $("#dlgNo").onclick = null; res(v); };
    $("#dlgYes").onclick = () => done(true);
    $("#dlgNo").onclick = () => done(false);
    d.oncancel = () => done(false);
    d.showModal();
  });
}

export function saveFile(bytes, name, type = "application/octet-stream") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function setProgress(bar, frac) {
  if (frac == null) { setTimeout(() => { bar.classList.remove("on"); bar.firstElementChild.style.width = "0"; }, 400); return; }
  bar.classList.add("on");
  bar.firstElementChild.style.width = (Math.min(1, frac) * 100) + "%";
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
