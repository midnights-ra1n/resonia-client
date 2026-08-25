fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["media_set_metadata", "media_set_playback", "media_clear"]),
    );
    tauri_build::try_build(attributes).expect("erreur de build Tauri (ACL app_manifest)");
}
