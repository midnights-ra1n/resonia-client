tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    // ... reste de ta config