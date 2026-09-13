use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Doit être enregistré avant tout autre plugin : sans lui, un second lancement de
        // l'app (double-clic répété, `tauri dev` relancé avec une build encore ouverte) ouvre
        // une seconde fenêtre au lieu de ramener la première au premier plan.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                // Sur macOS, la fenêtre peut être cachée (pas fermée, voir plus bas) : un
                // second lancement doit la refaire apparaître, pas juste la focaliser.
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        // Mémorise taille, position et état maximisé de la fenêtre entre deux lancements —
        // volontairement SANS StateFlags::VISIBLE : sur macOS la fenêtre est cachée (pas
        // détruite) à la fermeture (voir le hide-au-lieu-de-quitter ci-dessous), et on ne
        // veut jamais que ça se traduise par un relancement avec fenêtre restée masquée.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init());

    // Sur macOS uniquement : fermer la fenêtre principale (croix rouge) ne doit pas quitter
    // l'app, comme c'est la convention native de la plateforme (Safari, Mail, Musique...) —
    // l'icône reste dans le Dock, et l'app continue de tourner en arrière-plan pour une
    // relance quasi instantanée. On intercepte la demande de fermeture et on masque la
    // fenêtre au lieu de la laisser se détruire ; comme plus rien ne s'exécute côté lecture
    // audio quand la fenêtre est cachée sans piste en cours (voir GaplessEngine.pause/stop,
    // qui suspend déjà l'AudioContext), l'empreinte CPU/RAM en arrière-plan reste celle d'un
    // process Tauri au repos — négligeable — pas celle de l'app en pleine activité.
    #[cfg(target_os = "macos")]
    let builder = builder.on_window_event(|window, event| {
        if window.label() == "main" {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");

    app.run(|_app_handle, _event| {
        // Sur macOS, cliquer l'icône du Dock alors qu'aucune fenêtre n'est visible (la
        // fenêtre principale a été cachée, pas fermée) ne redéclenche PAS son affichage par
        // défaut — contrairement au comportement natif attendu (Safari, Notes...). On le
        // reproduit ici explicitement.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            if let Some(window) = _app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
