//! Pont natif Centre de contrôle / touches média (macOS: MPRemoteCommandCenter +
//! MPNowPlayingInfoCenter, via `souvlaki`).
//!
//! La Web MediaSession API (`navigator.mediaSession`) suffit à faire remonter métadonnées
//! et pochette au système, mais WKWebView (donc cette app compilée) ne relaie pas de façon
//! fiable les commandes DISTANTES (touches F7/F8/F9, boutons du widget Now Playing) vers ses
//! `setActionHandler` — contrairement à Safari.app qui bénéficie de privilèges système
//! additionnels. On enregistre donc les handlers directement côté Rust sur
//! MPRemoteCommandCenter, indépendamment de la webview, et on relaie les événements reçus au
//! frontend par un event Tauri ; dans l'autre sens, le frontend pousse métadonnées/position
//! via les commands ci-dessous.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig, SeekDirection};
use tauri::{AppHandle, Emitter, Manager};

const EVENT_NAME: &str = "media-control-event";

pub(crate) struct MediaControlsState(Mutex<MediaControls>);

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "value")]
enum MediaControlPayload {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    SeekForward,
    SeekBackward,
    SetPosition(f64),
}

fn to_payload(event: MediaControlEvent) -> Option<MediaControlPayload> {
    match event {
        MediaControlEvent::Play => Some(MediaControlPayload::Play),
        MediaControlEvent::Pause => Some(MediaControlPayload::Pause),
        MediaControlEvent::Toggle => Some(MediaControlPayload::Toggle),
        MediaControlEvent::Next => Some(MediaControlPayload::Next),
        MediaControlEvent::Previous => Some(MediaControlPayload::Previous),
        MediaControlEvent::Seek(SeekDirection::Forward) => Some(MediaControlPayload::SeekForward),
        MediaControlEvent::Seek(SeekDirection::Backward) => Some(MediaControlPayload::SeekBackward),
        MediaControlEvent::SeekBy(SeekDirection::Forward, _) => Some(MediaControlPayload::SeekForward),
        MediaControlEvent::SeekBy(SeekDirection::Backward, _) => Some(MediaControlPayload::SeekBackward),
        MediaControlEvent::SetPosition(position) => {
            Some(MediaControlPayload::SetPosition(position.0.as_secs_f64()))
        }
        // Stop/SetVolume/OpenUri/Raise/Quit : pas de pendant côté player Resonia, ignorés.
        _ => None,
    }
}

/// À appeler une fois au démarrage de l'app (voir `lib.rs`). Enregistre les handlers auprès
/// du système et gère l'état partagé nécessaire aux commands `media_set_*` ci-dessous.
pub fn init(app: &AppHandle) -> Result<(), souvlaki::Error> {
    let config = PlatformConfig {
        display_name: "Resonia",
        dbus_name: "com.resonia.client",
        hwnd: None,
    };

    let mut controls = MediaControls::new(config)?;

    let handle = app.clone();
    controls.attach(move |event| {
        eprintln!("[media_controls] événement système reçu : {event:?}");
        if let Some(payload) = to_payload(event) {
            let _ = handle.emit(EVENT_NAME, payload);
        } else {
            eprintln!("[media_controls] événement ignoré (pas de mapping)");
        }
    })?;

    app.manage(MediaControlsState(Mutex::new(controls)));
    eprintln!("[media_controls] initialisé");
    Ok(())
}

#[tauri::command]
pub fn media_set_metadata(
    state: tauri::State<MediaControlsState>,
    title: String,
    artist: String,
    album: String,
    cover_url: Option<String>,
    duration_secs: Option<f64>,
) -> Result<(), String> {
    let mut controls = state.0.lock().map_err(|e| e.to_string())?;
    controls
        .set_metadata(MediaMetadata {
            title: Some(&title),
            artist: Some(&artist),
            album: Some(&album),
            cover_url: cover_url.as_deref(),
            duration: duration_secs.map(Duration::from_secs_f64),
        })
        .map_err(|e| format!("{e:?}"))
}

#[tauri::command]
pub fn media_set_playback(
    state: tauri::State<MediaControlsState>,
    playing: bool,
    position_secs: f64,
) -> Result<(), String> {
    let mut controls = state.0.lock().map_err(|e| e.to_string())?;
    let progress = Some(souvlaki::MediaPosition(Duration::from_secs_f64(position_secs.max(0.0))));
    let playback = if playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    };
    controls.set_playback(playback).map_err(|e| format!("{e:?}"))
}

#[tauri::command]
pub fn media_clear(state: tauri::State<MediaControlsState>) -> Result<(), String> {
    let mut controls = state.0.lock().map_err(|e| e.to_string())?;
    controls
        .set_metadata(MediaMetadata::default())
        .map_err(|e| format!("{e:?}"))?;
    controls
        .set_playback(MediaPlayback::Stopped)
        .map_err(|e| format!("{e:?}"))
}
