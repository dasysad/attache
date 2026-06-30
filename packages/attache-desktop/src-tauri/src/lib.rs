// Attache desktop — Tauri 2 shell over loopback @attache/server (ADR-010).
//
// Release builds spawn a bundled Node sidecar from `server-bundle/` resources
// (prepared by scripts/prepare-bundle.mjs). Dev builds rely on
// beforeDevCommand (scripts/dev-server.mjs) and only wait for :8780.

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};

const DEFAULT_PORT: u16 = 8780;
const DEFAULT_UI_URL: &str = "http://127.0.0.1:8780/";

/// Holds the Node sidecar child so we can kill it on app exit.
struct ServerChild(Mutex<Option<Child>>);

fn ui_url() -> String {
    std::env::var("ATTACHE_UI_URL").unwrap_or_else(|_| DEFAULT_UI_URL.to_string())
}

fn server_port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().expect("loopback addr"),
        Duration::from_millis(400),
    )
    .is_ok()
}

fn wait_for_port(port: u16, attempts: u32) -> bool {
    for i in 0..attempts {
        if port_open(port) {
            return true;
        }
        if i + 1 < attempts {
            std::thread::sleep(Duration::from_millis(300));
        }
    }
    false
}

fn bundled_server_root(app: &AppHandle) -> Option<PathBuf> {
    let resource = app.path().resource_dir().ok()?;
    let bundle = resource.join("server-bundle");
    if bundle.join("dist").join("index.js").is_file() {
        Some(bundle)
    } else {
        None
    }
}

fn node_binary(bundle_root: &Path) -> PathBuf {
    let embedded = bundle_root.join("node").join("bin").join("node");
    if embedded.is_file() {
        embedded
    } else {
        PathBuf::from("node")
    }
}

fn spawn_bundled_server(app: &AppHandle) -> Result<(), String> {
    let bundle_root = bundled_server_root(app)
        .ok_or_else(|| "server-bundle missing from app resources".to_string())?;

    let node = node_binary(&bundle_root);
    let public_root = bundle_root.join("public");
    let port = server_port();

    let child = Command::new(&node)
        .current_dir(&bundle_root)
        .arg("dist/index.js")
        .env("PORT", port.to_string())
        .env("ATTACHE_PUBLIC_ROOT", &public_root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to spawn node sidecar: {e}"))?;

    app.state::<ServerChild>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .replace(child);

    Ok(())
}

fn stop_server(app: &AppHandle) {
    if let Ok(mut guard) = app.state::<ServerChild>().0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn ensure_server_running(app: &AppHandle) -> Result<(), String> {
    let port = server_port();

    if port_open(port) {
        eprintln!("[attache-desktop] server already on :{port}");
        return Ok(());
    }

    if bundled_server_root(app).is_some() {
        eprintln!("[attache-desktop] spawning bundled server on :{port}");
        spawn_bundled_server(app)?;
    } else if cfg!(debug_assertions) {
        eprintln!("[attache-desktop] dev mode — waiting for beforeDevCommand on :{port}");
    } else {
        return Err("server-bundle missing and no loopback server running".to_string());
    }

    if wait_for_port(port, 200) {
        return Ok(());
    }

    stop_server(app);
    Err(format!(
        "loopback server not reachable on :{port} (dev: run pnpm desktop:dev)"
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ServerChild(Mutex::new(None)))
        .setup(|app| {
            ensure_server_running(&app.handle())?;
            eprintln!("[attache-desktop] UI → {}", ui_url());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                stop_server(app_handle);
            }
        });
}
