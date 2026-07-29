<img src="assets/icons/resonia.png" alt="logo" title="resonia-client" align="right" height="50px" width="50px" />

# resonia-client

  <p align="center">
    <a href="https://github.com/midnights-ra1n/resonia-client/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/midnights-ra1n/resonia-client?style=flat-square&color=brightgreen"
      alt="License">
    </a>
      <a href="https://github.com/midnights-ra1n/resonia-client/releases">
      <img src="https://img.shields.io/github/v/release/midnights-ra1n/resonia-client?style=flat-square&color=blue"
      alt="Release">
    </a>
    
  </p>

---

Is a modern desktop client player for Navidrome and OpenSubsonic servers.

## Features

- [x] MPV player backend
- [x] Web player backend
- [x] Modern UI
- [x] Scrobble playback to your server
- [x] Smart playlist editor (Navidrome)
- [x] Synchronized and unsynchronized lyrics support
- [ ] Animated covers
- [ ] Optimistic caching (static covers, animated covers, musics)
- [ ] Smart playlists auto creation
- [ ] Listening stats with precision
- [ ] Connect feature (*Spotify Connect* like) to take control of clients of the same account all around the network
- [ ] [Request a feature](https://github.com/midnights-ra1n/resonia-client/issues) or [view taskboard](https://github.com/users/midnights-ra1n/projects/4)

## Screenshots

<a href="assets/screenshots/1.png"><img src="assets/screenshots/1.png" width="49.5%"/></a> <a href=".assets/screenshots/2.png"><img src="assets/screenshots/2.png" width="49.5%"/></a> <a href="assets/screenshots/3.png"><img src="assets/screenshots/3.png" width="49.5%"/></a> <a href="assets/screenshots/4.png"><img src="assets/screenshots/4.png" width="49.5%"/></a>

## Getting Started

### Desktop (recommended)

Download the [latest desktop client](https://github.com/midnights-ra1n/resonia-client/releases). The desktop client is the recommended way to use Feishin. It supports both the MPV and web player backends, as well as includes built-in fetching for lyrics.

#### macOS Notes

For media keys to work, you will be prompted to allow Feishin to be a Trusted Accessibility Client. After allowing, you will need to restart Feishin for the privacy settings to take effect.

#### Linux Notes

Muses isn't available on Flathub or Snap Store for now.

Alternatively, you can install it as an AppImage. I provide a small install script to download the latest `.AppImage`, make it executable, and also download the icons required by Desktop Environments. Finally, it generates a `.desktop` file to add Muses to your Application Launcher.

Also I provide `deb` and `rpm` packages. 

Simply run the installer like this:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/midnights-ra1n/resonia-client/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir"
```

The script also has an option to add launch arguments to run Feishin in native Wayland mode. Note that this is experimental in Electron and therefore not officially supported. If you want to use it, run this instead:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/midnights-ra1n/resonia-client/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir" wayland-native
```

It also provides a simple uninstall routine, removing the downloaded files:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/midnights-ra1n/resonia-client/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir" remove
```

The entry should show up in your Application Launcher immediately. If it does not, simply log out, wait 10 seconds, and log back in. Your Desktop Environment may alternatively provide a way to reload entries.

### Web and Docker

Visit [https://resonia.vercel.app](https://resonia.vercel.app) to use the hosted web version of Feishin. The web client only supports the web player backend.

Feishin is also available as a Docker image. The images are hosted via `ghcr.io` and are available to view [here](https://github.com/midnights-ra1n/resonia-client/pkgs/container/resonia-client). You can run the container using the following commands:

```bash
# Run the latest version
docker run --name resonia-client -p 9180:9180 ghcr.io/midnights-ra1n/resonia-client:latest

# Build the image locally
docker build -t resonia-client .
docker run --name resonia-client -p 9180:9180 feishin
```

## Translation

This project uses [Weblate](https://hosted.weblate.org/projects/feishin/) for translations. If you would like to contribute, please visit the link and submit a translation.

## License

[GNU General Public License v3.0 ©](https://github.com/jeffvli/feishin/blob/dev/LICENSE)
