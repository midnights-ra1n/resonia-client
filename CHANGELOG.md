# Changelog

Resonia release notes, handwritten for each release—not automatically generated
from GitHub commits or PRs. This file (and this file alone) populates the
body of GitHub releases and the desktop app's update pop-up (see
'scripts/extract-changelog.mjs' and '.github/workflows/release-*.yml').

Section format: '## X.Y.Z' (matching the 'package.json' version exactly, without the git tag's 'v' prefix),
followed by a blank line and then the content in plain Markdown (bulleted lists recommended).
An empty or missing section for the version being released causes the release workflow
to fail—this is intentional, to ensure empty or outdated notes are never published.

## [Unreleased]

<!-- Add changes here as they occur. When publishing a version, rename
this section '## X.Y.Z' (the version that was just bumped) and recreate an empty
'## [Unreleased]' section above it for future changes. -->

## 1.1.0-beta.2

- Fixed songs restarting their download from scratch when you leave them and come back: the part already downloaded is now kept (desktop)
- Playback bar: lyrics, queue, connect and volume buttons reordered like Spotify, with a thinner volume slider that turns orange on hover
- Hovering the progress bar now shows a tooltip with the time at the cursor position


## 1.1.0-beta.1

- New default icon set inspired by Spotify's, completed so every icon of the app matches (other icon packs are still available in Settings → Appearance)
- Waveform progress bar: new style option in Settings → Appearance (three bands or amplitude only)
- Progress bar: the small hover marker is gone and the bar now gets a lighter background on hover, like Spotify
- Animated equalizer next to the track that is playing in track lists
- "+" / "✓" button at the end of the title column in track lists to add a song to (or see it in) your liked songs
- First groundwork for the iOS mobile app: home, album page, background playback, cache

## 1.0.1

- Fixed the progress bar not filling up to the new position after clicking on it: it now jumps right to where you clicked, like Spotify

## 1.0.0

The first stable release of Resonia, a fast, Spotify-like desktop and web player for Navidrome.

New since 1.0.0-beta.9:
- The progress bar now shows every part of the song that is loaded and every part you've already listened to, even after skipping around
- More Spotify-like look: white play button and progress bar (orange on hover), thinner progress bar, tighter corners and spacing, deeper black background
- The Spotify Mix font now works everywhere, without having to install it on your system
- New icon packs (Material, Phosphor, Lucide, Tabler, Remix, Font Awesome and more) and an icon size setting in Settings → Appearance

Everything that came with the betas:
- Gapless playback, with the next tracks preloaded and cached so songs start instantly and never cut between tracks
- Home, album, artist, playlist, favorites, search, tracks, genres, folders and statistics pages
- Synced lyrics, a play queue, shuffle and repeat, and downloads for offline listening
- Themes (Resonia Orange, Catppuccin, Nord, Monokai, Tokyo Night, Everforest, Spotify, GitHub Dark), custom fonts and a waveform progress bar
- System media controls and Now Playing on macOS, Windows and Linux
- Automatic updates that install in the background
- Scrobbling to your Navidrome server, artist info from Last.fm and optionally Spotify, experimental AirPlay
- Desktop apps for macOS, Windows and Linux, plus a web version and Docker image

## 1.0.0-beta.9
- Media controls now work from the macOS Now Playing menu and the keyboard media keys (play/pause, next, previous)
- Media controls no longer stop working after the queue ends
- When playback is paused or stopped, Resonia no longer shows up as playing sound (speaker icon in the KDE/GNOME taskbar) and uses less CPU
- New color themes: Spotify and GitHub Dark
- New font: Spotify Mix (uses the font installed on your system)
- Fixed downloads not restarting after a download error

## 1.0.0-beta.8
- New Statistics page: plays, listening time, top songs, artists and albums, genres, decades and formats, synced with your Navidrome server
- Detailed listening history on each device: listening time per day, month, hour and weekday, listening streaks and skipped songs, for the last 7 days, 30 days or all time
- The Folders page now shows folders and files as a list, like a file explorer
- Songs that aren't cached yet load faster when they start playing
- Fixed the buffer bar sometimes following the playback position on transcoded streams

## 1.0.0-beta.7
- Restarting to install an update is faster: Resonia closes right away and a small system window with a progress bar shows until the new version opens (macOS, Windows and Linux)

## 1.0.0-beta.6
- Updates now download in the background and install automatically the next time you quit Resonia
- New download indicator for updates in the top bar, with progress and size
- The update pop-up now uses your system's native dialogs (Windows, macOS, GNOME, KDE Plasma)
- Fixed the "Restart to install update" button doing nothing
- Fixed release notes showing raw HTML tags in the update pop-up
- Fixed the buffer bar following the playback position instead of showing how much of the track is actually loaded
- Fixed the buffer bar sometimes freezing while playback is paused
- Fixed shuffle (and repeat) sometimes staying active for the next track after turning it off
- Beta updates are now enabled by default on beta versions (and stay disabled by default on stable versions)
- New Artists page: every artist in your library, with a quick filter
- New Tracks page: your whole library, sortable (title, artist, album, year, recently added, most played) and searchable
- New Genres page, and a page for each genre with its albums
- New Folders page to browse your library folder by folder, with breadcrumbs, parent folder (Backspace) and playable files
- Artist pages open instantly when you come back to them
- Slightly larger text for song, artist and album names and in menus

## 1.0.0-beta.5
- Fixed missing app description and infinite loading in KDE Discover / GNOME Software for the .deb and .rpm packages (added AppStream metadata)
- New UI (themes, custom fonts, progress bar waveform, new pages layout)
- Improved Web Audio API
- Added Spotify API optional support
- Added more details on song properties
- Added waveform

## 1.0.0-beta.4
- re-release of beta 4

## 1.0.0-beta.3
- Dropped Tauri V2 support for Electron
- Google Fonts icons are now used by default in local
- Add experimental support for AirPlay (very unstable)
- Improved lyrics sync with enabled pitch
- Improved update system
- Add this changelog file

## 1.0.0-beta.2

- First entry.
