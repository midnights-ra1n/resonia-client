# Resonia mobile (Flutter)

The iOS / Android client of Resonia. Both platforms look the same: the Geist font is bundled and the theme comes from `apps/client`.

Distribution is outside the stores for now: IPA files for iOS, APK files for Android.

## Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) 3.47+ (`brew install --cask flutter` on macOS)
- **iOS:** Xcode 26+ (for both the simulator and real iPhones)
- **Android:** Android Studio (it installs the Android SDK), then `flutter doctor --android-licenses`

Run `flutter doctor` to check your setup.

## Run

```sh
cd apps/mobile
flutter pub get
flutter run                     # pick a simulator or a connected device
flutter test && flutter analyze
```

To use a specific device, get its ID with `flutter devices`, then run `flutter run -d <id>`. Use the ID
rather than the device name, since names often contain characters that are awkward to type (`Noé’s iPhone`).

## Sideload on an iPhone with Xcode

A free Apple ID ("Personal Team") is enough. You don't need a paid developer account.

**One-time setup:**

1. Xcode → Settings → Accounts → `+` → add your Apple ID.
2. Run `open ios/Runner.xcworkspace` (the `.xcworkspace`, not the `.xcodeproj`). Click **Runner** at the top
   of the left sidebar, then the **Runner** target, then the **Signing & Capabilities** tab. Check
   *Automatically manage signing* and pick your **Team** ("Your Name (Personal Team)").
   If Xcode rejects `com.resonia.resonia` ("Failed to register bundle identifier"), change the
   Bundle Identifier to one of your own, e.g. `com.<nickname>.resonia`.
3. On the iPhone, plugged in over USB for the first install (Wi-Fi works once it's paired) and unlocked:
   - accept "Trust This Computer";
   - Settings → Privacy & Security → **Developer Mode** → turn it on, restart, then confirm.

**Install from the terminal:**

```sh
flutter devices                         # find the iPhone's ID
flutter run --release -d <device-id>    # builds, signs and installs
```

**Or install from Xcode:**

1. Run `flutter build ios --release` once, to generate the Flutter files Xcode needs.
2. Pick your iPhone in the device menu at the top center of the Xcode window.
3. Product → Scheme → **Edit Scheme…** → Run → set **Build Configuration** to **Release**.
4. Click ▶︎ (or press ⌘R).

**First launch:** iOS blocks the app until you trust it. Go to Settings → General →
**VPN & Device Management** → your Apple ID → **Trust**, then open Resonia again.

Good to know:
- Use a **Release** build (or Profile) for everyday use. On iOS, a **Debug** build won't start from the
  home screen unless Xcode or `flutter run` is attached.
- With a free Apple ID, the app expires after **7 days**. Run it again from Xcode or with
  `flutter run --release` to renew it; the app's data is kept. A free account can have at most 3
  sideloaded apps at a time.

## Build an IPA

### With a paid developer account (signed IPA)

```sh
flutter build ipa --export-method ad-hoc        # → build/ios/ipa/resonia.ipa
```

Only iPhones whose UDID is registered on developer.apple.com (Devices) can install it. To install it,
drag the `.ipa` onto the iPhone in Finder, or use Xcode → Window → Devices and Simulators → your
iPhone → `+` under *Installed Apps*. `--export-method development` works too.

### Without a paid account (unsigned IPA, for AltStore / Sideloadly)

These tools re-sign the IPA with your Apple ID when they install it.

```sh
flutter build ipa --no-codesign      # builds the archive only ("skipping IPA" is expected)
rm -rf build/ios/unsigned && mkdir -p build/ios/unsigned/Payload
cp -R build/ios/archive/Runner.xcarchive/Products/Applications/Runner.app build/ios/unsigned/Payload/
(cd build/ios/unsigned && zip -qry Resonia.ipa Payload)   # → build/ios/unsigned/Resonia.ipa
```

The same 7-day limit applies when the tool signs with a free Apple ID.

## Build an APK

```sh
flutter build apk --release          # → build/app/outputs/flutter-apk/app-release.apk
```

## Login and session

The app signs in with the Subsonic token scheme, like the web client. It checks the credentials with a
`ping`, then stores only the server URL, the username, the salt and the token
(`md5(password + salt)`), never the password itself. This session is kept in the iOS Keychain or
the Android Keystore (`flutter_secure_storage`), so you stay logged in across restarts until you log
out from the account menu (the avatar at the top left).

### `http://` on the local network

Plain `http://` is only accepted for local-network servers; any other address must use `https://`.
Local means:

- private IPv4 addresses (`10.x`, `172.16–31.x`, `192.168.x`), loopback, link-local (`169.254.x`);
- `100.64–127.x`, the range used by Tailscale and other VPNs;
- IPv6 loopback, link-local and unique-local (`fc00::/7`) addresses;
- `localhost`, `*.local` (mDNS) and single-label host names such as `nas`.

If you leave out the scheme, the app picks `http://` for a local address (`192.168.1.2:4533`) and
`https://` for anything else (`music.example.com`).

On iOS, `Info.plist` sets `NSAllowsLocalNetworking`, the App Transport Security exception for local
hosts only. On Android, cleartext traffic can't be limited to IP ranges, so `AndroidManifest.xml`
allows it and the app enforces the rule itself (`normalizeServerUrl` in `lib/session.dart`).

## Player

The audio engine lives in `lib/player/` and is built on
[`just_audio`](https://pub.dev/packages/just_audio). It follows the same rules as the desktop engine.

- **Gapless playback.** The whole queue is handed to the native player, so the next track starts
  without a gap. The native player is AVQueuePlayer on iOS and ExoPlayer on Android. Both remove
  the encoder delay and padding using the file's own metadata, so original files are streamed
  untouched whenever the platform can play them. The desktop engine decodes tracks itself and also
  trims up to 0.3 s of pure digital silence at each track's edges. That extra trim isn't on mobile
  yet.
- **Background playback.** `just_audio_background` (built on `audio_service`) gives the lock screen,
  Control Center, the Dynamic Island, Android's media notification and headset buttons. This
  requires `UIBackgroundModes: audio` in `Info.plist`, plus the `AudioService` service,
  `MediaButtonReceiver` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` in `AndroidManifest.xml`.
  `MainActivity` extends `AudioServiceActivity`.
- **Cache.** Each track is streamed and written to disk by a single download
  (`LockCachingAudioSource`). The cache is stored in `<app cache>/audio/<server>/`, holds up to 2 GB
  and evicts the least recently played tracks first. Tracks already in the cache are played from the
  file.
  - Original files are kept as they are (`mp3`, `m4a`, `aac`, `flac`, `wav`, `aiff`, `alac`, plus
    `ogg` and `opus` on Android).
  - Other formats are transcoded by Navidrome to AAC 256 kbps. Transcoded streams carry no gapless
    metadata.
- **Preload.** The current track and the next 3 are downloaded, in the order playback will follow
  (shuffle and repeat-all included). The current track always has priority, like on desktop:
  - nothing else downloads until it has 15 seconds buffered;
  - then one upcoming track downloads alongside it;
  - once it is fully downloaded, the remaining upcoming tracks download in parallel.

  A track that is still downloading is reused when it appears in a new queue, so a file is never
  downloaded twice.
- **Shuffle.** With shuffle on, the Play button starts on a random track. Tapping a track starts
  with that track.
- **Navidrome Now Playing and play counts.** These follow the desktop rules. After 1 second of
  playback, the track shows in Navidrome's Now Playing. The play is counted at half the track, or
  after 4 minutes at most, and only for tracks of 30 seconds or more. A play that was already
  counted before a force quit isn't counted again.
- **Resume after a force quit.** The queue, the shuffle order and the repeat mode are saved whenever
  they change. The current track and position are saved every second while playing, and on pause,
  seek, track change or when the app goes to the background. Writes are atomic: a temp file, then a
  rename. The next launch restores everything paused at the same position. A different server
  doesn't restore the queue, and logging out forgets it.
- **Cover art.** Tracks of an album use the album's cover, so changing tracks never downloads it
  again. Covers are requested in three sizes only (200, 600 and 1000 px), so one download
  serves several screens. They go through the API's HTTP connection, are kept in
  `<app cache>/covers/` and are read from disk on later launches. The dominant colour reuses the
  200 px file.
- **Battery.** The position display ticks only while music plays and the screen is visible. It
  stops when the app is in the background or the page is covered.
- **Pitch.** The pitch control works like a turntable, with a range of ±4, ±8, ±10 or ±16 %.
  - By default, speed and pitch change together.
  - With **Master Tempo** on, the tempo changes and the key stays the same.

  The settings are saved in `settings.json`.

### Patched `just_audio`

On iOS, `just_audio` always keeps the pitch when the speed changes. To change both together, the app
uses a copy of `just_audio` 0.10.6 in `third_party/just_audio`, which is wired in through
`dependency_overrides` in `pubspec.yaml`. Each change in that copy is marked `RESONIA PATCH`:
`setPitch` picks AVFoundation's `Varispeed` algorithm (speed and pitch together) or `Spectral`
(Master Tempo). The algorithm is only switched when it has to be, because switching it on a playing
track causes an audible drop; at normal speed the current one is kept. To update `just_audio`, copy the new version over that folder and apply the
`RESONIA PATCH` blocks again.

## Icons

The app uses Google's **Material Symbols Rounded**, like the web client's default icon pack. The
font in `assets/fonts/MaterialSymbolsRounded.ttf` only contains the icons listed in `lib/icons.dart`
(about 2 KB instead of 15 MB). It keeps the `FILL` axis, so an active tab draws the filled version of
the same glyph (`Icon(icon, fill: 1)`).

To add an icon:

1. Find it on [fonts.google.com/icons](https://fonts.google.com/icons?icon.style=Rounded) and copy its
   code point.
2. Add a line to `lib/icons.dart`: `static const myIcon = IconData(0x…, fontFamily: _f);`.
3. Rebuild the font (this needs `pip install fonttools`):
   ```sh
   python3 tool/subset_icons.py
   ```
   The script downloads the full font from Google's GitHub repository. You can also pass the path of
   a local copy of `MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf`.

## App icon

The iOS (`ios/Runner/Assets.xcassets/AppIcon.appiconset`) and Android (`android/app/src/main/res/mipmap-*`)
icons use the diamond from the desktop app's `apps/client/build/Resonia.icon`. Android uses an
adaptive icon (dark background, diamond foreground, monochrome variant for themed icons) and keeps a
legacy PNG for Android 7. The launch screens use the same dark background (`#0C0B0A`), so the app
doesn't flash white when it starts.

## Translations

`lib/l10n/app_en.arb` is the reference file and `lib/l10n/app_fr.arb` holds the French strings. Add
every new key to both files. `flutter pub get` and `flutter run` regenerate the Dart code
automatically.
