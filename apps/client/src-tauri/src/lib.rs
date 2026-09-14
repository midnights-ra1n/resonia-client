use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/** WebKitGTK (webview Linux) choisit par défaut, sur beaucoup de GPU/pilotes Mesa (Intel,
 *  AMD, machines virtuelles), un chemin de rendu accéléré par DMA-BUF connu pour produire un
 *  défilement très saccadé (task WebKit https://bugs.webkit.org/show_bug.cgi?id=261874 et son
 *  lot de rapports équivalents côté Tauri/Electron/GTK4 — plafond observé autour de 20-30 FPS
 *  au lieu du plein taux de rafraîchissement) voire des images totalement blanches sur
 *  certaines combinaisons. Désactiver spécifiquement CE renderer (pas la compositing
 *  acceleration dans son ensemble, qui elle doit rester active) fait retomber WebKitGTK sur
 *  son chemin de composition GL classique, nettement plus stable en pratique. Sans effet sur
 *  macOS/Windows (WKWebView/WebView2 ignorent cette variable) : on peut la poser
 *  inconditionnellement avant la création de la fenêtre, à condition de ne jamais écraser un
 *  choix explicite de l'utilisateur/de l'environnement de déploiement. */
#[cfg(target_os = "linux")]
fn apply_webkitgtk_perf_workarounds() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// Mêmes endpoints que tauri.conf.json (stable) / tauri.beta.conf.json (canal beta figé au
/// build) — dupliqués ici car le réglage "recevoir les mises à jour bêta" doit pouvoir basculer
/// une build STABLE vers le flux beta à l'exécution, ce que l'updater ne permet pas nativement
/// (ses endpoints sont figés au build). La commande ci-dessous reconstruit donc un updater avec
/// l'endpoint choisi à la volée plutôt que d'utiliser celui de la config.
#[cfg(desktop)]
const UPDATE_ENDPOINT_STABLE: &str =
    "https://github.com/midnights-ra1n/resonia-client/releases/download/stable-updater/latest.json";
#[cfg(desktop)]
const UPDATE_ENDPOINT_BETA: &str =
    "https://github.com/midnights-ra1n/resonia-client/releases/download/beta-updater/latest.json";

/// Vérifie la disponibilité d'une mise à jour sur le canal demandé et, si trouvée, enregistre
/// l'`Update` dans la table de ressources du plugin — le rid renvoyé reste ensuite utilisable
/// tel quel par les commandes standard du plugin (`plugin:updater|download_and_install`, etc.)
/// appelées depuis le front, aucune duplication de la logique de téléchargement/installation.
#[cfg(desktop)]
#[tauri::command]
async fn check_for_update(
    webview: tauri::Webview,
    beta: bool,
) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_updater::UpdaterExt;

    let endpoint = if beta {
        UPDATE_ENDPOINT_BETA
    } else {
        UPDATE_ENDPOINT_STABLE
    };
    let url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;

    let updater = webview
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    // Chaque canal pointe vers une release à tag fixe (stable-updater / beta-updater, voir les
    // constantes ci-dessus et publish-*-pointer dans les workflows) plutôt que vers "latest" :
    // tant qu'aucune release de ce canal n'a encore été publiée (le projet n'a par exemple
    // encore publié aucune stable), ce tag n'existe pas et l'URL renvoie un 404, que le plugin
    // remonte comme `Error::ReleaseNotFound`. C'est un état normal ("pas de mise à jour sur ce
    // canal pour l'instant"), pas une panne : on le traite comme "aucune mise à jour disponible"
    // plutôt que de faire remonter une erreur générique côté interface. Les vraies pannes
    // (réseau, TLS, JSON invalide...) continuent, elles, de remonter normalement.
    let update = match updater.check().await {
        Ok(update) => update,
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => None,
        Err(e) => return Err(e.to_string()),
    };

    let Some(update) = update else {
        return Ok(None);
    };

    let current_version = update.current_version.clone();
    let version = update.version.clone();
    let body = update.body.clone();
    let raw_json = update.raw_json.clone();
    let rid = webview.resources_table().add(update);

    Ok(Some(serde_json::json!({
        "rid": rid,
        "currentVersion": current_version,
        "version": version,
        "body": body,
        "rawJson": raw_json,
    })))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_webkitgtk_perf_workarounds();

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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    // Le plugin updater n'existe que pour desktop (pas de mobile_entry_point côté mise à jour
    // autonome sur les stores) : on le garde derrière ce cfg pour ne pas casser une éventuelle
    // cible mobile future.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![check_for_update]);

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
