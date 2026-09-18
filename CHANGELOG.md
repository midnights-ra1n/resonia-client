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

## 1.0.0-beta.5
- Fixed missing app description and infinite loading in KDE Discover / GNOME Software for the .deb and .rpm packages (added AppStream metadata)

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
