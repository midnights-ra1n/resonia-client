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
