/* Amphora desktop (Tauri): runs before the game in every page load.
   - makes the window feel like an app, not a web page (no right-click menu, no text selection, no browser shortcuts)
   - F11 full screen, Esc leaves it, Ctrl +/-/0 zoom, F5 / Ctrl+R reload
   - the update banner and the "version / check for updates" row in the help window, like the previous app */
(function () {
  "use strict";
  if (window.__amphoraShell) return; window.__amphoraShell = true;
  const T = () => window.__TAURI__;
  const invoke = (cmd, args) => { try { return T() ? T().core.invoke(cmd, args || {}) : Promise.reject("no tauri"); } catch (e) { return Promise.reject(e); } };
  const logp = m => invoke("amph_log", { msg: String(m) }).catch(() => {});
  window.addEventListener("error", e => logp("error: " + (e.message || e.type) + " @" + (e.filename || "") + ":" + (e.lineno || "")));
  window.addEventListener("unhandledrejection", e => logp("promise: " + (e.reason && (e.reason.stack || e.reason))));

  /* ---- app feel ---- */
  const editable = t => t && t.closest && t.closest("input,textarea,select,[contenteditable=true]");
  document.addEventListener("contextmenu", e => { if (!editable(e.target)) e.preventDefault(); }, true);
  document.addEventListener("dragstart", e => { if (e.target && e.target.tagName === "IMG") e.preventDefault(); }, true);
  const ZK = "amphora-zoom";
  let zoom = 1; try { zoom = +localStorage.getItem(ZK) || 1; } catch (e) {}
  const applyZoom = () => { document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom); try { localStorage.setItem(ZK, String(zoom)); } catch (e) {} };
  document.addEventListener("keydown", e => {
    const k = e.key, c = e.ctrlKey || e.metaKey, lk = (k || "").toLowerCase();
    if (k === "F11") { e.preventDefault(); invoke("amph_fullscreen", {}); return; }
    if (k === "Escape") { invoke("amph_fullscreen", { on: false }).catch(() => {}); return; }
    if (k === "F5" || (c && lk === "r")) { e.preventDefault(); location.reload(); return; }
    if (c && (k === "=" || k === "+")) { e.preventDefault(); zoom = Math.min(2, Math.round((zoom + .1) * 10) / 10); applyZoom(); return; }
    if (c && k === "-") { e.preventDefault(); zoom = Math.max(.5, Math.round((zoom - .1) * 10) / 10); applyZoom(); return; }
    if (c && k === "0") { e.preventDefault(); zoom = 1; applyZoom(); return; }
    /* browser shortcuts that make no sense in a game window: find, print, save, view source, history, downloads, new window… */
    if (c && !editable(e.target) && "fpsughjdnoltw".includes(lk) && lk.length === 1 && !(lk === "a")) { e.preventDefault(); return; }
    if (["F3", "F7", "F12"].includes(k) || (c && e.shiftKey && ["i", "j", "c", "delete"].includes(lk))) { e.preventDefault(); }
  }, true);
  /* Ctrl + mouse wheel would zoom the web view: use our zoom instead */
  document.addEventListener("wheel", e => { if (e.ctrlKey) { e.preventDefault(); zoom = Math.max(.5, Math.min(2, Math.round((zoom + (e.deltaY < 0 ? .1 : -.1)) * 10) / 10)); applyZoom(); } }, { passive: false, capture: true });
  window.open = url => { invoke("amph_open", { url: String(url || "") }).catch(() => {}); return null; };
  document.addEventListener("click", e => {
    const a = e.target && e.target.closest && e.target.closest("a[href^='https://']");
    if (a) { e.preventDefault(); invoke("amph_open", { url: a.href }).catch(() => {}); }
  }, true);

  /* ---- update banner ---- */
  function el(tag, css, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  const BTN = "font:600 14px Georgia,serif;padding:5px 12px;border-radius:6px;border:1px solid #6b4a1e;cursor:pointer;margin-left:8px";
  function toast(msg) {
    const t = el("div", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#2b2014;color:#f6ecd2;border:1px solid #c9a24a;border-radius:8px;padding:9px 14px;font:15px Georgia,serif", msg);
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }
  function banner(info) {
    const old = document.getElementById("amph-upd"); if (old) old.remove();
    if (info.kind === "none" || info.kind === "error") { toast(info.kind === "none" ? `Amphora is up to date (version ${info.version}).` : info.message); return; }
    const b = el("div", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:4px;max-width:92vw;" +
      "background:linear-gradient(180deg,#2b2014,#1a130b);color:#f6ecd2;border:2px solid #c9a24a;border-radius:10px;padding:10px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:15px Georgia,serif");
    b.id = "amph-upd";
    const txt = el("div", "flex:1;min-width:0");
    txt.append(el("b", "color:#f2c552;font-family:Cinzel,Georgia,serif", info.kind === "ready" ? `Amphora ${info.version} is ready` : `A new Amphora app (${info.version}) is available`));
    if (info.notes) txt.append(el("div", "font-size:13px;opacity:.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", info.notes));
    if (info.kind === "shell") txt.append(el("div", "font-size:13px;opacity:.85;margin-top:2px", "This update needs the new installer. Your progress is kept."));
    const go = el("button", BTN + ";background:#f2c552;color:#2b1d08", info.kind === "ready" ? "Restart now" : "Download");
    go.onclick = () => info.kind === "ready" ? invoke("amph_restart") : invoke("amph_open", { url: info.page });
    const later = el("button", BTN + ";background:transparent;color:#f6ecd2", "Later");
    later.onclick = () => b.remove();
    b.append(txt, go, later);
    document.body.appendChild(b);
  }

  /* ---- version row in the help window ---- */
  let INFO = null;
  const addRow = () => {
    const host = document.querySelector(".savebk");
    if (!host || !INFO || host.querySelector(".amph-ver")) return;
    const row = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:14px");
    row.className = "amph-ver";
    row.append(el("span", "opacity:.8", `Desktop app ${INFO.shell} · game version ${INFO.game}${INFO.ready ? ` (update ${INFO.ready.version} waiting: restart to play it)` : ""}`));
    const b = el("button", null, "Check for updates"); b.className = "btn small";
    b.onclick = () => { b.textContent = "Checking…"; invoke("amph_check"); setTimeout(() => { b.textContent = "Check for updates"; }, 4000); };
    row.append(b);
    host.appendChild(row);
  };

  function boot() {
    const st = document.createElement("style");
    st.textContent = "html,body{-webkit-user-select:none;user-select:none;-webkit-user-drag:none}input,textarea,select,[contenteditable=true]{-webkit-user-select:text;user-select:text}img{-webkit-user-drag:none}";
    document.head.appendChild(st);
    applyZoom();
    new MutationObserver(addRow).observe(document.body, { childList: true, subtree: true });
    const t = T();
    if (t && t.event) t.event.listen("amphora-update", e => banner(e.payload)).catch(err => logp("listen failed: " + err));
    invoke("amph_info").then(i => { INFO = i; addRow(); }).catch(err => logp("info failed: " + err));
    setTimeout(() => {
      const ok = !!(document.body && document.body.children.length > 1 && (document.querySelector("#home,.mast,#app,main") || document.body.innerText.length > 200));
      invoke("amph_loaded", { ok, note: "tauri=" + !!t + " chars=" + (document.body ? document.body.innerText.length : 0) + " title=" + document.title }).catch(() => {});
    }, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
