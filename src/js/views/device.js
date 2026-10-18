// Device tab: info, live stats, settings, tools.
import { S, on } from "../state.js";
import { CMD } from "../protocol.js";
import { $, esc, fmtSize, confirmBox, toast, store } from "../util.js";
import { request, bgRequest } from "../midi.js";
import { resetDevice, setPace } from "../device.js";

const CFG = {
  FS: ["Sample rate", v => v + " Hz"], BS: ["Block size", v => v + " samples"], BD: ["Bit depth", v => v + " bit"], DF: ["Data format", v => v],
  BY: ["Codec bypass", v => v ? "on" : "off"], SW: ["Swap L/R", v => v ? "on" : "off"], PC: ["Program change button", v => v ? "on" : "off"],
  BL: ["Bootloader lock", v => v ? "locked" : "unlocked"],
  IO: ["Input offset", v => ((v | 0) / 65535).toFixed(4)], IS: ["Input scalar", v => ((v | 0) / 65535).toFixed(3)],
  OO: ["Output offset", v => ((v | 0) / 65535).toFixed(4)], OS: ["Output scalar", v => ((v | 0) / 65535).toFixed(3)],
  MI: ["MIDI input channel", v => v], MO: ["MIDI output channel", v => v],
};

function renderInfo() {
  const rows = [["Firmware", S.fw], ["Bootloader", S.boot], ["Device ID", S.id], ["MIDI port", S.out?.name], ["Last message", S.msg]];
  $("#devInfo").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd class="${k === "Device ID" ? "mono" : ""}">${v ? esc(v) : '<span class="faint">–</span>'}</dd>`).join("");
}
function meter(el, frac) {
  el.firstElementChild.style.width = (Math.min(1, frac) * 100) + "%";
  el.classList.toggle("hot", frac > .7);
  el.classList.toggle("crit", frac > .9);
}
function renderStats() {
  $("#cpuTxt").textContent = S.cpu == null ? "–" : S.cpu + "%";
  meter($("#cpuM"), (S.cpu || 0) / 100);
  $("#memTxt").textContent = S.mem == null ? "–" : fmtSize(S.mem) + " heap";
  $("#stoTxt").textContent = S.storage ? `${fmtSize(S.storage[0])} / ${fmtSize(S.storage[1])}` : "–";
  meter($("#stoM"), S.storage ? S.storage[0] / S.storage[1] : 0);
  const eb = $("#errBox");
  eb.classList.toggle("hidden", !S.error);
  eb.textContent = S.error;
}
function renderConfig() {
  const keys = Object.keys(S.config);
  $("#cfgRows").innerHTML = keys.length ? keys.map(k => {
    const c = CFG[k];
    return `<tr><td class="mono faint">${k}</td><td>${c ? c[0] : k}</td><td class="mono">${esc(c ? c[1](S.config[k]) : S.config[k])}</td></tr>`;
  }).join("") : `<tr><td colspan=3 class="empty">${S.out ? "Reading…" : "Connect the Lich to read its settings."}</td></tr>`;
}

export function initDevice() {
  $("#infoBtn").onclick = () => {
    if (!S.out) return toast("Not connected", "warn");
    request(127); request(CMD.DEVICE_ID); bgRequest(CMD.CONFIG);
  };
  $("#liveSw").onclick = () => { S.live = !S.live; $("#liveSw").setAttribute("aria-checked", S.live); };
  $("#resetBtn").onclick = async () => {
    if (S.out && await confirmBox("Restart the Lich?", "The module reboots and USB reconnects. Audio stops for a few seconds.", "Restart")) resetDevice();
  };
  const p = store.get("lich-pace");
  if (p != null) $("#pace").value = p;
  setPace($("#pace").value);
  $("#pace").onchange = e => { setPace(e.target.value); store.set("lich-pace", e.target.value); };

  on("device", renderInfo); on("conn", () => { renderInfo(); renderConfig(); });
  on("stats", renderStats); on("config", renderConfig);
  renderInfo(); renderStats(); renderConfig();
}
