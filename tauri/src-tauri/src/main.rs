// Amphora desktop app (Tauri). One window; the game is served from local files through the amphora:// protocol.
// Game files: a downloaded update in <data>/Amphora/updates/game-<version> when it is newer and intact,
// otherwise the copy bundled with the installer. Updates are checked against SHA-256 hashes from the
// published manifest, like the previous (Electron) app, and the same updates folder is used.
// Local only: if <data>/Amphora/admin/marginalia-<version>.js exists it is served instead of the game script
// (the Admin tab build that exists on the developer's PC only; it is never published).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{http, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const MANIFEST: &str = "https://raw.githubusercontent.com/cheesymc91-beep/Amphora/main/updates/manifest.json";
const PAGE: &str = "https://github.com/cheesymc91-beep/Amphora/releases/latest";
const SHELL: &str = env!("CARGO_PKG_VERSION");
const INIT: &str = include_str!("init.js");

#[derive(Clone)]
struct Game {
    dir: PathBuf,
    version: String,
    downloaded: bool,
}
struct St {
    game: Mutex<Game>,
    ready: Mutex<Option<(String, String)>>,
    checking: Mutex<bool>,
}

fn base(app: &AppHandle) -> PathBuf {
    app.path().data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("Amphora")
}
fn up_root(app: &AppHandle) -> PathBuf {
    base(app).join("updates")
}
fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
fn log(app: &AppHandle, msg: &str) {
    let d = base(app);
    let _ = fs::create_dir_all(&d);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(d.join("update.log")) {
        let _ = writeln!(f, "{} [app {}] {}", now(), SHELL, msg);
    }
}
fn cmp_ver(a: &str, b: &str) -> Ordering {
    let p = |s: &str| s.split('.').map(|x| x.trim().parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    let (x, y) = (p(a), p(b));
    for i in 0..x.len().max(y.len()) {
        let (u, v) = (*x.get(i).unwrap_or(&0), *y.get(i).unwrap_or(&0));
        if u != v {
            return u.cmp(&v);
        }
    }
    Ordering::Equal
}
fn read_json(p: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
}
fn bundled(app: &AppHandle) -> Game {
    let res = app.path().resource_dir().unwrap_or_default();
    let version = fs::read_to_string(res.join("game-version.txt")).unwrap_or_else(|_| "0.0.0".into()).trim().to_string();
    Game { dir: res.join("game"), version, downloaded: false }
}
fn pick(app: &AppHandle) -> Game {
    let b = bundled(app);
    if let Some(cur) = read_json(&up_root(app).join("current.json")) {
        let v = cur["version"].as_str().unwrap_or("").to_string();
        let bad = cur["bad"].as_bool().unwrap_or(false);
        let dir = up_root(app).join(format!("game-{}", v));
        if !v.is_empty() && !bad && cmp_ver(&v, &b.version) == Ordering::Greater && dir.join("index.html").exists() {
            return Game { dir, version: v, downloaded: true };
        }
    }
    b
}

/* ---------- serving the game ---------- */
fn mime(p: &str) -> &'static str {
    match p.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}
fn respond(status: u16, ctype: &str, body: Vec<u8>) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Cache-Control", "no-cache")
        .body(body)
        .unwrap()
}
fn serve(app: &AppHandle, path: &str) -> http::Response<Vec<u8>> {
    let mut rel = path.trim_start_matches('/').to_string();
    if rel.is_empty() {
        rel = "index.html".into();
    }
    if rel.contains("..") || rel.contains('\\') || rel.contains(':') {
        return respond(403, "text/plain", b"forbidden".to_vec());
    }
    let game = app.state::<St>().game.lock().unwrap().clone();
    if rel == "js/marginalia.js" {
        let adm = base(app).join("admin").join(format!("marginalia-{}.js", game.version));
        if let Ok(b) = fs::read(&adm) {
            return respond(200, mime(&rel), b);
        }
    }
    match fs::read(game.dir.join(&rel)) {
        Ok(b) if rel == "index.html" => {
            // let the page talk to the app (Tauri's IPC endpoints) despite the game's own content policy
            let html = String::from_utf8_lossy(&b).replace(
                "connect-src 'self'",
                "connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost",
            );
            respond(200, mime(&rel), html.into_bytes())
        }
        Ok(b) => respond(200, mime(&rel), b),
        Err(_) => {
            if game.downloaded && rel == "index.html" {
                mark_bad(app, &game.version, "index.html missing");
            }
            respond(404, "text/plain", b"not found".to_vec())
        }
    }
}
fn mark_bad(app: &AppHandle, version: &str, why: &str) {
    log(app, &format!("update {} marked bad: {}", version, why));
    let f = up_root(app).join("current.json");
    if let Some(mut cur) = read_json(&f) {
        if cur["version"].as_str() == Some(version) {
            cur["bad"] = serde_json::Value::Bool(true);
            let _ = fs::write(&f, cur.to_string());
        }
    }
}

/* ---------- updater ---------- */
fn notify(app: &AppHandle, v: serde_json::Value) {
    let _ = app.emit("amphora-update", v);
}
fn fetch(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, String> {
    let sep = if url.contains('?') { '&' } else { '?' };
    let r = client.get(format!("{}{}t={}", url, sep, now())).send().map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("{} {}", r.status(), url));
    }
    r.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())
}
fn safe_name(n: &str) -> bool {
    !n.is_empty() && !n.contains("..") && !n.starts_with('/') && n.chars().all(|c| c.is_ascii_alphanumeric() || "_-./".contains(c))
}
fn check(app: AppHandle, manual: bool) {
    {
        let st = app.state::<St>();
        let mut c = st.checking.lock().unwrap();
        if *c {
            return;
        }
        *c = true;
    }
    let res = (|| -> Result<(), String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(60))
            .user_agent(format!("Amphora/{}", SHELL))
            .build()
            .map_err(|e| e.to_string())?;
        let m: serde_json::Value = serde_json::from_slice(&fetch(&client, MANIFEST)?).map_err(|e| e.to_string())?;
        let st = app.state::<St>();
        let have = match &*st.ready.lock().unwrap() {
            Some((v, _)) => v.clone(),
            None => st.game.lock().unwrap().version.clone(),
        };
        let ver = m["version"].as_str().unwrap_or("").to_string();
        let notes = m["notes"].as_str().unwrap_or("").to_string();
        if ver.is_empty() || cmp_ver(&ver, &have) != Ordering::Greater {
            if manual {
                notify(&app, serde_json::json!({"kind":"none","version":have}));
            }
            return Ok(());
        }
        // a manifest can ask for a newer app; the Electron era used "shell" 1.x, so only "app" is read here
        if let Some(need) = m["app"].as_str() {
            if cmp_ver(need, SHELL) == Ordering::Greater {
                notify(&app, serde_json::json!({"kind":"shell","version":ver,"notes":notes,"page":PAGE}));
                return Ok(());
            }
        }
        let files = m["files"].as_object().ok_or("bad manifest")?;
        if !files.contains_key("index.html") || files.keys().any(|n| !safe_name(n)) {
            return Err("bad manifest".into());
        }
        let basepath = format!("{}{}", MANIFEST.rsplit_once('/').map(|x| x.0).unwrap_or(""), "/") + m["base"].as_str().unwrap_or("game/");
        let fin = up_root(&app).join(format!("game-{}", ver));
        let tmp = up_root(&app).join(format!("game-{}.part", ver));
        let _ = fs::remove_dir_all(&tmp);
        for (n, h) in files {
            let buf = fetch(&client, &format!("{}{}", basepath, n))?;
            let got = format!("{:x}", Sha256::digest(&buf));
            if Some(got.as_str()) != h.as_str() {
                return Err(format!("hash mismatch for {}", n));
            }
            let out = tmp.join(n);
            if let Some(p) = out.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            fs::write(&out, &buf).map_err(|e| e.to_string())?;
        }
        let _ = fs::remove_dir_all(&fin);
        fs::rename(&tmp, &fin).map_err(|e| e.to_string())?;
        fs::write(
            up_root(&app).join("current.json"),
            serde_json::json!({"version":ver,"installed":now()}).to_string(),
        )
        .map_err(|e| e.to_string())?;
        // keep the newest two downloaded versions (and the one running)
        let running = st.game.lock().unwrap().version.clone();
        if let Ok(rd) = fs::read_dir(up_root(&app)) {
            let mut vs: Vec<String> = rd
                .filter_map(|e| e.ok()?.file_name().into_string().ok())
                .filter_map(|n| n.strip_prefix("game-").map(|s| s.to_string()))
                .filter(|v| v.chars().all(|c| c.is_ascii_digit() || c == '.'))
                .collect();
            vs.sort_by(|a, b| cmp_ver(b, a));
            for v in vs.iter().skip(2) {
                if *v != running {
                    let _ = fs::remove_dir_all(up_root(&app).join(format!("game-{}", v)));
                }
            }
        }
        log(&app, &format!("downloaded update {}", ver));
        *st.ready.lock().unwrap() = Some((ver.clone(), notes.clone()));
        notify(&app, serde_json::json!({"kind":"ready","version":ver,"notes":notes}));
        Ok(())
    })();
    if let Err(e) = res {
        log(&app, &format!("update check failed: {}", e));
        if let Ok(rd) = fs::read_dir(up_root(&app)) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().ends_with(".part") {
                    let _ = fs::remove_dir_all(e.path());
                }
            }
        }
        if manual {
            notify(&app, serde_json::json!({"kind":"error","message":"Couldn't check for updates. Are you online?"}));
        }
    }
    *app.state::<St>().checking.lock().unwrap() = false;
}

/* ---------- commands for the page ---------- */
#[tauri::command]
fn amph_info(app: AppHandle) -> serde_json::Value {
    let st = app.state::<St>();
    let g = st.game.lock().unwrap().clone();
    let ready = st.ready.lock().unwrap().clone().map(|(v, n)| serde_json::json!({"version":v,"notes":n}));
    serde_json::json!({"shell":SHELL,"game":g.version,"downloaded":g.downloaded,"updates":true,"ready":ready})
}
#[tauri::command]
fn amph_check(app: AppHandle) {
    std::thread::spawn(move || check(app, true));
}
/* the game saves on "pagehide": fire it, give it a moment, then restart or close */
fn save_then(app: AppHandle, then: fn(AppHandle)) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval("try{window.dispatchEvent(new Event('pagehide'))}catch(e){}");
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        then(app);
    });
}
#[tauri::command]
fn amph_restart(app: AppHandle) {
    save_then(app, |a| a.restart());
}
#[tauri::command]
fn amph_open(url: String) {
    if url.starts_with("https://") {
        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
    }
}
#[tauri::command]
fn amph_fullscreen(app: AppHandle, on: Option<bool>) -> bool {
    if let Some(w) = app.get_webview_window("main") {
        let f = on.unwrap_or(!w.is_fullscreen().unwrap_or(false));
        let _ = w.set_fullscreen(f);
        return f;
    }
    false
}
#[tauri::command]
fn amph_loaded(app: AppHandle, ok: bool, note: String) {
    let g = app.state::<St>().game.lock().unwrap().clone();
    log(&app, &format!("page loaded: game {} ok={} {}", g.version, ok, note));
    if std::env::var("AMPHORA_SMOKE").is_ok() {
        let _ = fs::write(base(&app).join("smoke.txt"), format!("ok={} game={} {}", ok, g.version, note));
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(500));
            app.exit(0);
        });
    }
}
#[tauri::command]
fn amph_log(app: AppHandle, msg: String) {
    log(&app, &format!("page: {}", msg.chars().take(500).collect::<String>()));
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("amphora", |ctx, req| serve(ctx.app_handle(), req.uri().path()))
        .invoke_handler(tauri::generate_handler![amph_info, amph_check, amph_restart, amph_open, amph_fullscreen, amph_loaded, amph_log])
        .setup(|app| {
            let h = app.handle().clone();
            let g = pick(&h);
            log(&h, &format!("start: game {} ({})", g.version, if g.downloaded { "downloaded" } else { "bundled" }));
            app.manage(St { game: Mutex::new(g), ready: Mutex::new(None), checking: Mutex::new(false) });
            let url = if cfg!(windows) { "http://amphora.localhost/index.html" } else { "amphora://localhost/index.html" };
            let h2 = h.clone();
            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::CustomProtocol(url.parse().unwrap()))
                .title("Amphora")
                .inner_size(1320.0, 900.0)
                .min_inner_size(820.0, 600.0)
                .initialization_script(INIT)
                .disable_drag_drop_handler()
                .on_navigation(move |u| {
                    let local = u.scheme() == "amphora" || u.host_str() == Some("amphora.localhost") || u.scheme() == "about";
                    if !local && (u.scheme() == "https") {
                        let _ = tauri_plugin_opener::open_url(u.as_str(), None::<&str>);
                    }
                    let _ = &h2;
                    local
                })
                .build()?;
            let h3 = h.clone();
            win.on_window_event(move |e| {
                if let WindowEvent::CloseRequested { api, .. } = e {
                    api.prevent_close();
                    save_then(h3.clone(), |a| {
                        if let Some(w) = a.get_webview_window("main") {
                            let _ = w.destroy();
                        }
                    });
                }
            });
            // check for updates shortly after start, then every 3 hours
            let h4 = h.clone();
            std::thread::spawn(move || {
                if std::env::var("AMPHORA_SMOKE").is_ok() {
                    return;
                }
                std::thread::sleep(Duration::from_secs(6));
                loop {
                    check(h4.clone(), false);
                    std::thread::sleep(Duration::from_secs(3 * 3600));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Amphora");
}
