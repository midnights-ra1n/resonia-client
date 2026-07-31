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

### Web and Docker

```bash
# Run the latest version
docker run --name resonia-client -p 9180:9180 ghcr.io/midnights-ra1n/resonia-client:latest

# Build the image locally
docker build -t resonia-client .
docker run --name resonia-client -p 9180:9180 feishin
```

## Translation

## License
