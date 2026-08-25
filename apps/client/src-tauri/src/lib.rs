mod media_controls;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            media_controls::media_set_metadata,
            media_controls::media_set_playback,
            media_controls::media_clear,
        ])
        .setup(|app| {
            if let Err(err) = media_controls::init(app.handle()) {
                eprintln!("[media_controls] échec d'initialisation : {err:?}");
            }
            Ok(())
        })
        // ... reste de ta config
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}
