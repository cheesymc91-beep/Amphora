/* Amphora desktop shell: one window, offline game files, saves kept in %APPDATA%\Amphora.
   Auto-update: game files are downloaded from the published repository into %APPDATA%\Amphora\updates,
   checked against SHA-256 hashes, and used from the next start. The bundled copy is always kept as a fallback. */
const { app, BrowserWindow, shell, Menu, session, ipcMain, net } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const PKG = require("./package.json");
const SHELL_VERSION = PKG.version;               // version of this desktop shell (main.js / preload.js)
const BUNDLED_GAME = PKG.gameVersion || PKG.version;
const BUNDLED_DIR = path.join(__dirname, "game");
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "update.json"), "utf8")); } catch (e) {}

app.setName("Amphora");
app.setAppUserModelId("com.amphora.game");
if (!app.requestSingleInstanceLock()) { app.quit(); }

/* ---------- small helpers ---------- */
const cmpVer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
const upRoot = () => path.join(app.getPath("userData"), "updates");
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const log = (...a) => { try { fs.appendFileSync(path.join(app.getPath("userData"), "update.log"), new Date().toISOString() + " " + a.join(" ") + "\n"); } catch (e) {} };

/* which copy of the game to start: a downloaded update if it is newer and intact, else the bundled one */
function pickGame() {
  const cur = readJSON(path.join(upRoot(), "current.json"));
  if (cur && cur.version && cmpVer(cur.version, BUNDLED_GAME) > 0 && !cur.bad) {
    const dir = path.join(upRoot(), "game-" + cur.version);
    if (fs.existsSync(path.join(dir, "index.html"))) return { dir, version: cur.version, downloaded: true };
  }
  return { dir: BUNDLED_DIR, version: BUNDLED_GAME, downloaded: false };
}

/* ---------- window ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window.json");
function loadState() { return readJSON(stateFile()) || { width: 1320, height: 900 }; }
function saveState(win) {
  try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() })); } catch (e) {}
}

let win = null, game = null;
function create() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1320, height: st.height || 900, minWidth: 820, minHeight: 600,
    title: "Amphora", backgroundColor: "#ece1c8", show: false, autoHideMenuBar: true,
    icon: process.platform === "win32" ? path.join(__dirname, "amphora.ico") : undefined,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  });
  /* Windows: no menu bar. Mac: the standard app, Edit and Window menus, so Cmd+Q, Cmd+C / Cmd+V and Cmd+M work */
  Menu.setApplicationMenu(process.platform === "darwin"
    ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }] }, { role: "windowMenu" }])
    : null);
  if (st.maximized) win.maximize();
  if (st.fullscreen) win.setFullScreen(true);
  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveState(win));

  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  /* a downloaded update that fails to load is marked bad and the bundled game is used instead */
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (isMain && game && game.downloaded) { markBad(game.version, "load failed: " + desc); game = pickGame(); win.loadFile(path.join(game.dir, "index.html")); }
  });
  win.webContents.on("render-process-gone", () => { if (game && game.downloaded) { markBad(game.version, "renderer crashed"); } });

  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (process.platform === "darwin" && i.key !== "F12") return;   /* the Mac menu handles fullscreen, zoom and reload */
    const k = i.key, c = i.control || i.meta;
    if (k === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (k === "Escape" && win.isFullScreen()) { win.setFullScreen(false); }
    else if (k === "F5" || (c && k.toLowerCase() === "r")) { win.webContents.reload(); e.preventDefault(); }
    else if (c && (k === "=" || k === "+")) { win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (c && k === "-") { win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (c && k === "0") { win.webContents.setZoomLevel(0); e.preventDefault(); }
    else if (k === "F12") { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  game = pickGame();
  log("start shell", SHELL_VERSION, "game", game.version, game.downloaded ? "(downloaded)" : "(bundled)");
  win.loadFile(path.join(game.dir, "index.html"));
}
function markBad(version, why) {
  log("update", version, "marked bad:", why);
  const f = path.join(upRoot(), "current.json"), cur = readJSON(f);
  if (cur && cur.version === version) { cur.bad = true; try { fs.writeFileSync(f, JSON.stringify(cur)); } catch (e) {} }
}

/* ---------- updater ---------- */
const SAFE = /^(?!.*\.\.)[A-Za-z0-9_\-./]+$/;
async function fetchBuf(url) {
  const r = await net.fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(r.status + " " + url);
  return Buffer.from(await r.arrayBuffer());
}
let checking = false, ready = null;
async function checkForUpdate(manual) {
  if (checking || !CFG.manifest) return;
  checking = true;
  try {
    const m = JSON.parse((await fetchBuf(CFG.manifest)).toString("utf8"));
    const have = ready ? ready.version : game.version;
    if (!m.version || cmpVer(m.version, have) <= 0) { if (manual) notify({ kind: "none", version: have }); return; }
    if (m.shell && cmpVer(m.shell, SHELL_VERSION) > 0) { notify({ kind: "shell", version: m.version, notes: m.notes || "", page: m.installer || CFG.page }); return; }
    const files = m.files || {}, names = Object.keys(files);
    if (!names.length || !files["index.html"] || names.some(n => !SAFE.test(n) || path.isAbsolute(n))) throw new Error("bad manifest");
    const base = CFG.manifest.replace(/[^/]*$/, "") + (m.base || "game/");
    const final = path.join(upRoot(), "game-" + m.version), tmp = final + ".part";
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const n of names) {
      const buf = await fetchBuf(base + n.split("/").map(encodeURIComponent).join("/"));
      const h = crypto.createHash("sha256").update(buf).digest("hex");
      if (h !== files[n]) throw new Error("hash mismatch for " + n);
      const out = path.join(tmp, n);
      if (!out.startsWith(tmp + path.sep)) throw new Error("bad path " + n);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
    fs.writeFileSync(path.join(upRoot(), "current.json"), JSON.stringify({ version: m.version, installed: new Date().toISOString() }));
    /* keep only the newest two downloaded versions */
    try {
      const old = fs.readdirSync(upRoot()).filter(d => /^game-[\d.]+$/.test(d)).map(d => d.slice(5)).sort(cmpVer).reverse().slice(2);
      old.forEach(v => { if (v !== game.version) fs.rmSync(path.join(upRoot(), "game-" + v), { recursive: true, force: true }); });
    } catch (e) {}
    log("downloaded update", m.version);
    ready = { version: m.version, notes: m.notes || "" };
    notify({ kind: "ready", version: m.version, notes: m.notes || "" });
  } catch (e) {
    log("update check failed:", e.message);
    try { fs.readdirSync(upRoot()).filter(d => d.endsWith(".part")).forEach(d => fs.rmSync(path.join(upRoot(), d), { recursive: true, force: true })); } catch (e2) {}
    if (manual) notify({ kind: "error", message: "Couldn't check for updates. Are you online?" });
  } finally { checking = false; }
}
function notify(info) { if (win && !win.isDestroyed()) win.webContents.send("amphora:update", info); }

ipcMain.on("amphora:restart", () => {
  if (win && !win.isDestroyed()) saveState(win);
  app.relaunch(); app.quit();               // closing the page fires the game's own save
});
ipcMain.on("amphora:open", (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on("amphora:check", () => checkForUpdate(true));
ipcMain.handle("amphora:info", () => ({ shell: SHELL_VERSION, game: game ? game.version : BUNDLED_GAME, updates: !!CFG.manifest, ready }));

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "clipboard-sanitized-write"));
  create();
  win.webContents.once("did-finish-load", () => {
    setTimeout(() => checkForUpdate(false), 4000);
    setInterval(() => checkForUpdate(false), 3 * 3600 * 1000);
  });
});
app.on("window-all-closed", () => app.quit());
