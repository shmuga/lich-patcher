// Build card: compiles the patch on the lich-patcher-server (Heavy + ARM GCC) and hands
// the binary to the existing upload code. The button is only enabled while /health says ok.
import { S, on, emit } from "../../state.js";
import { $, esc, toast, confirmBox, saveFile, safeName, fmtSize, store, setProgress } from "../../util.js";
import { serialize } from "../../pd/model.js";
import { cleanName } from "../../pd/owl.js";
import { toSyx } from "../../protocol.js";
import { upload } from "../../device.js";
import { stage } from "../patches.js";
import * as Lib from "../../library.js";
import { E } from "./state.js";

const DEFAULT_URL = (import.meta.env.VITE_BUILD_SERVER || "").replace(/\/+$/, "");
const H = { state: "unknown", info: null, message: "" };   // unknown | ok | down | none
let building = false, built = null, timer = 0;

const url = () => (store.get("lich-build-url") ?? DEFAULT_URL).replace(/\/+$/, "");
const key = () => store.get("lich-build-key") || "";
const say = (text, kind) => emit("ed:console", { kind, text });
const hostOf = u => { try { return new URL(u).host; } catch { return u; } };

async function health() {
  const base = url();
  if (!base) { Object.assign(H, { state: "none", info: null, message: "No build server set" }); return render(); }
  try {
    const r = await fetch(base + "/health", { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const j = await r.json();
    Object.assign(H, { state: j.ok ? "ok" : "down", info: j, message: j.ok ? "" : (j.message || "Builder offline") });
  } catch (e) {
    Object.assign(H, { state: "down", info: null, message: e.name === "TimeoutError" ? "Server didn't answer" : "Server unreachable" });
  }
  render();
}

function blocker() {
  if (building) return "Building…";
  if (H.state === "none") return "Set a build server first";
  if (H.state !== "ok") return "Build server unavailable: " + (H.message || "checking…");
  if (H.info?.auth && !key()) return "This server needs a build key";
  if (E.issues.length) return `Fix ${E.issues.length} Heavy problem${E.issues.length > 1 ? "s" : ""} first`;
  return "";
}

function render() {
  const why = blocker(), host = hostOf(url());
  $("#bdDot").className = "dot" + (H.state === "ok" ? " on" : H.state === "down" ? " err" : "");
  $("#bdState").textContent = H.state === "ok" ? `${host} · ready` : H.state === "none" ? "not configured" : H.state === "down" ? `${host || "server"} · ${H.message}` : "checking…";
  $("#bdState").title = H.info?.toolchain || "";
  const btn = $("#bdBuild");
  btn.disabled = !!why;
  btn.title = why || "Compile with Heavy + ARM GCC on " + host;
  $("#bdWhy").textContent = why && !building ? why : "";
  for (const id of ["#bdStage", "#bdSyx", "#bdLib"]) $(id).disabled = !built;
  $("#bdRun").disabled = !built || !S.out;
  $("#bdRun").title = !S.out ? "Connect the Lich first" : "Upload into RAM and run (nothing is stored)";
}

async function build() {
  if (blocker()) return;
  if (store.get("lich-build-ok") !== "1") {
    const ok = await confirmBox("Build on the server?",
      `The patch is sent to ${hostOf(url())} and compiled with Heavy and the ARM toolchain in a sandbox. ` +
      "A build takes a few seconds of server CPU and builds are rate-limited, so preview in the browser first and build when it sounds right.", "Build");
    if (!ok) return;
    store.set("lich-build-ok", "1");
  }
  building = true; built = null; render();
  $("#bdResult").innerHTML = "";
  const bar = $("#bdProg"), t0 = performance.now();
  bar.classList.add("on", "indet");
  const name = cleanName(E.name);
  say(`Building "${name}" on ${hostOf(url())}…`, "info");
  try {
    const headers = { "content-type": "application/json" };
    if (key()) headers.authorization = "Bearer " + key();
    const r = await fetch(url() + "/build", {
      method: "POST", headers, body: JSON.stringify({ name, pd: serialize(E.model) }),
      signal: AbortSignal.timeout(180000),
    });
    const j = await r.json().catch(() => ({ message: `HTTP ${r.status}` }));
    if (r.ok && j.ok && j.binary) {
      const data = Uint8Array.from(atob(j.binary), c => c.charCodeAt(0));
      built = { name, data };
      say(`Built ${fmtSize(data.length)} in ${(j.millis / 1000).toFixed(1)} s (${((performance.now() - t0) / 1000).toFixed(1)} s round trip)`, "ok");
      if (j.log?.trim()) say(j.log.trim(), "raw");
      $("#bdResult").innerHTML = `<span class="tag ok">built</span> <b>${esc(name)}</b> <span class="muted">${fmtSize(data.length)}</span>`;
    } else {
      const stageName = { validate: "rejected by the server", heavy: "Heavy couldn't compile it", compile: "the C compile failed" }[j.stage] || "build failed";
      say(`${stageName}${j.message ? ": " + j.message : ""}`, "err");
      for (const is of j.issues || []) say(`line ${is.line}: ${is.message}`, "err");
      if (j.log?.trim()) say(j.log.trim(), "raw");
      $("#bdResult").innerHTML = `<span class="tag red">failed</span> <span class="muted">${esc(stageName)}, see the console</span>`;
      if (r.status === 401) toast("The build key was refused", "err");
      if (r.status === 429) toast(j.message || "Rate limited", "warn", 5000);
    }
  } catch (e) {
    say("Build request failed: " + (e.name === "TimeoutError" ? "timed out" : e.message), "err");
    $("#bdResult").innerHTML = `<span class="tag red">failed</span> <span class="muted">server didn't answer</span>`;
    health();
  } finally {
    building = false;
    bar.classList.remove("indet"); setProgress(bar, null);
    render();
  }
}

async function runOnLich() {
  if (!built || !S.out) return;
  const bar = $("#bdProg");
  try {
    await upload(built.data, { run: true }, f => setProgress(bar, f));
    toast(`Running "${built.name}" on the Lich`);
  } catch (e) { toast("Upload failed: " + e.message, "err", 6000); }
  finally { setProgress(bar, null); }
}

function settings() {
  const box = $("#bdSettings");
  box.classList.toggle("hidden");
  $("#bdUrl").value = url(); $("#bdKey").value = key();
  $("#bdUrl").placeholder = DEFAULT_URL;
}

export function initBuild() {
  $("#bdBuild").onclick = build;
  $("#bdRun").onclick = runOnLich;
  $("#bdStage").onclick = () => { if (!built) return; stage(built.data, { file: built.name + ".bin", fromSyx: false }); emit("tab", "patches"); };
  $("#bdSyx").onclick = () => built && saveFile(toSyx(built.data), safeName(built.name) + ".syx");
  $("#bdLib").onclick = () => built && Lib.add(built.data, "pd build", built.name);
  $("#bdGear").onclick = settings;
  $("#bdSave").onclick = () => {
    const u = $("#bdUrl").value.trim();
    if (u && !/^https?:\/\//.test(u)) return toast("The server address must start with https://", "warn");
    store.set("lich-build-url", u); store.set("lich-build-key", $("#bdKey").value.trim());
    $("#bdSettings").classList.add("hidden");
    H.state = "unknown"; render(); health();
  };
  on("ed:changed", render);
  on("conn", render);
  on("tab", t => { clearInterval(timer); if (t === "editor") { health(); timer = setInterval(() => !document.hidden && health(), 30000); } });
  addEventListener("focus", () => $("#v-editor").classList.contains("on") && health());
  render();
  if ($("#v-editor").classList.contains("on")) health();
}
