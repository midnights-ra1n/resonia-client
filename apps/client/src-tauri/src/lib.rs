use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doit être enregistré avant tout autre plugin : sans lui, un second lancement de
        // l'app (double-clic répété, `tauri dev` relancé avec une build encore ouverte) ouvre
        // une seconde fenêtre au lieu de ramener la première au premier plan.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        // ... reste de ta config
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}
