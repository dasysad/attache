// Attache desktop — Tauri 2 shell over loopback @attache/server (ADR-010).
//
// Release builds spawn a bundled Node sidecar from `server-bundle/` resources
// (prepared by scripts/prepare-bundle.mjs). Dev builds rely on
// beforeDevCommand (scripts/dev-server.mjs) and only wait for :8780.

use std::env;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

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

/// VS-8: `~/.attache/data/keyfile.json` means the sidecar needs a unlock key.
fn home_data_dir() -> Option<PathBuf> {
    env::var("HOME")
        .ok()
        .map(|h| PathBuf::from(h).join(".attache").join("data"))
}

fn vault_is_encrypted() -> bool {
    home_data_dir()
        .map(|d| d.join("keyfile.json").is_file())
        .unwrap_or(false)
}

fn vault_key_in_env() -> bool {
    env::var("ATTACHE_PASSPHRASE").is_ok() || env::var("ATTACHE_DEK").is_ok()
}

/// macOS native passphrase dialog before spawning the Node sidecar (VS-8 Phase D).
#[cfg(target_os = "macos")]
fn prompt_vault_passphrase() -> Option<String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            r#"display dialog "Enter your Attache vault passphrase:" default answer "" with hidden answer with title "Attache""#,
            "-e",
            "text returned of result",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(not(target_os = "macos"))]
fn prompt_vault_passphrase() -> Option<String> {
    None
}

/// Inject unlock env into the sidecar when the vault is encrypted.
fn apply_vault_unlock_env(cmd: &mut Command) {
    if !vault_is_encrypted() || vault_key_in_env() {
        return;
    }
    if let Some(pass) = prompt_vault_passphrase() {
        cmd.env("ATTACHE_PASSPHRASE", pass);
        eprintln!("[attache-desktop] vault unlocked via system dialog");
    } else {
        eprintln!("[attache-desktop] no passphrase — server will show /vault/unlock");
    }
}

fn spawn_bundled_server(app: &AppHandle) -> Result<(), String> {
    let bundle_root = bundled_server_root(app)
        .ok_or_else(|| "server-bundle missing from app resources".to_string())?;

    let node = node_binary(&bundle_root);
    let public_root = bundle_root.join("public");
    let port = server_port();

    let mut child_cmd = Command::new(&node);
    child_cmd
        .current_dir(&bundle_root)
        .arg("dist/index.js")
        .env("PORT", port.to_string())
        .env("ATTACHE_PUBLIC_ROOT", &public_root)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    apply_vault_unlock_env(&mut child_cmd);

    let child = child_cmd
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

/// Check GitHub-hosted updater manifest on startup (release builds only).
#[cfg(desktop)]
async fn check_for_updates(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let Ok(updater) = app.updater() else {
        return;
    };
    let Ok(Some(update)) = updater.check().await else {
        return;
    };
    eprintln!(
        "[attache-desktop] update {} available — downloading",
        update.version
    );
    if let Err(e) = update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
    {
        eprintln!("[attache-desktop] update install failed: {e}");
        return;
    }
    app.request_restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ServerChild(Mutex::new(None)))
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_updates(handle).await;
                });
            }
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
