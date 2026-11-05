/* Amphora desktop: update banner + version/“check for updates” row in the help window.
   Runs isolated from the game page; talks to the shell only through these few messages. */
const { ipcRenderer } = require("electron");

function el(tag, css, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
const BTN = "font:600 14px Georgia,serif;padding:5px 12px;border-radius:6px;border:1px solid #6b4a1e;cursor:pointer;margin-left:8px";

function banner(info) {
  document.getElementById("amph-upd")?.remove();
  if (info.kind === "none" || info.kind === "error") { toast(info.kind === "none" ? `Amphora is up to date (version ${info.version}).` : info.message); return; }
  const b = el("div", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:4px;max-width:92vw;" +
    "background:linear-gradient(180deg,#2b2014,#1a130b);color:#f6ecd2;border:2px solid #c9a24a;border-radius:10px;padding:10px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:15px Georgia,serif");
  b.id = "amph-upd";
  const txt = el("div", "flex:1;min-width:0");
  const title = el("b", "color:#f2c552;font-family:Cinzel,Georgia,serif", info.kind === "ready" ? `Amphora ${info.version} is ready` : `A new Amphora app (${info.version}) is available`);
  txt.append(title);
  if (info.notes) txt.append(el("div", "font-size:13px;opacity:.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", info.notes));
  if (info.kind === "shell") txt.append(el("div", "font-size:13px;opacity:.85;margin-top:2px", "This update needs the new installer. Your progress is kept."));
  const go = el("button", BTN + ";background:#f2c552;color:#2b1d08", info.kind === "ready" ? "Restart now" : "Download");
  go.onclick = () => info.kind === "ready" ? ipcRenderer.send("amphora:restart") : ipcRenderer.send("amphora:open", info.page);
  const later = el("button", BTN + ";background:transparent;color:#f6ecd2", "Later");
  later.onclick = () => b.remove();
  b.append(txt, go, later);
  document.body.appendChild(b);
}
function toast(msg) {
  const t = el("div", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#2b2014;color:#f6ecd2;border:1px solid #c9a24a;border-radius:8px;padding:9px 14px;font:15px Georgia,serif", msg);
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
ipcRenderer.on("amphora:update", (e, info) => banner(info));

/* version + manual check, added under the save backup in the help window */
let INFO = null;
ipcRenderer.invoke("amphora:info").then(i => { INFO = i; });
const addRow = () => {
  const host = document.querySelector(".savebk");
  if (!host || !INFO || host.querySelector(".amph-ver")) return;
  const row = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:14px");
  row.className = "amph-ver";
  const label = el("span", "opacity:.8", `Desktop app · game version ${INFO.game}${INFO.ready ? ` (update ${INFO.ready.version} waiting: restart to play it)` : ""}`);
  row.append(label);
  if (INFO.updates) {
    const b = el("button", null, "Check for updates"); b.className = "btn small";
    b.onclick = () => { b.textContent = "Checking…"; ipcRenderer.send("amphora:check"); setTimeout(() => { b.textContent = "Check for updates"; }, 4000); };
    row.append(b);
  }
  host.appendChild(row);
};
window.addEventListener("DOMContentLoaded", () => new MutationObserver(addRow).observe(document.body, { childList: true, subtree: true }));
