import Flutter
import MediaPlayer
import UIKit

/// Canal `resonia/engine` : pont entre le contrôleur Dart (lib/player/player.dart) et GaplessEngine,
/// plus l'écran verrouillé (MPNowPlayingInfoCenter) et ses boutons (MPRemoteCommandCenter).
final class GaplessPlugin {
  private let engine = GaplessEngine()
  private let channel: FlutterMethodChannel
  private var info: [String: Any] = [:]
  private var artUrl: String?

  init(messenger: FlutterBinaryMessenger) {
    channel = FlutterMethodChannel(name: "resonia/engine", binaryMessenger: messenger)
    engine.onStarted = { [weak self] id, duration in
      self?.emit("started", ["id": id, "duration": duration])
    }
    engine.onEnded = { [weak self] in self?.emit("ended", nil) }
    engine.onPlaying = { [weak self] playing, position in
      self?.emit("playing", ["playing": playing, "position": position])
    }
    engine.onError = { [weak self] id in self?.emit("error", ["id": id]) }
    channel.setMethodCallHandler { [weak self] call, result in self?.handle(call, result) }
    setupRemote()
  }

  private func emit(_ method: String, _ args: [String: Any]?) {
    DispatchQueue.main.async { [weak self] in self?.channel.invokeMethod(method, arguments: args) }
  }

  private func tracks(_ a: [String: Any]?) -> [EngineTrack] {
    (a?["tracks"] as? [[String: String]] ?? []).compactMap {
      guard let id = $0["id"], let path = $0["path"] else { return nil }
      return EngineTrack(id: id, path: path)
    }
  }

  private func handle(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
    let a = call.arguments as? [String: Any]
    switch call.method {
    case "start":
      engine.start(tracks(a), position: a?["position"] as? Double ?? 0, play: a?["play"] as? Bool ?? true) { ok in
        DispatchQueue.main.async { result(ok) }
      }
    case "setNext": engine.setNext(tracks(a)); result(nil)
    case "play": engine.play(); result(nil)
    case "pause":
      engine.pause { p in
        DispatchQueue.main.async { result(p) }
      }
    case "seek":
      engine.seek(a?["position"] as? Double ?? 0) { DispatchQueue.main.async { result(nil) } }
    case "stop": engine.stop(); result(nil)
    case "setRate":
      engine.setRate(a?["speed"] as? Double ?? 1, coupled: a?["coupled"] as? Bool ?? true)
      result(nil)
    case "position":
      engine.position { p in DispatchQueue.main.async { result(p) } }
    case "nowPlaying": nowPlaying(a); result(nil)
    case "nowPlayingState": nowPlayingState(a); result(nil)
    default: result(FlutterMethodNotImplemented)
    }
  }

  // MARK: écran verrouillé

  private func nowPlaying(_ a: [String: Any]?) {
    guard let a else {
      info = [:]
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      return
    }
    info = [
      MPMediaItemPropertyTitle: a["title"] as? String ?? "",
      MPMediaItemPropertyArtist: a["artist"] as? String ?? "",
      MPMediaItemPropertyAlbumTitle: a["album"] as? String ?? "",
      MPMediaItemPropertyPlaybackDuration: a["duration"] as? Double ?? 0,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: 0.0,
      MPNowPlayingInfoPropertyPlaybackRate: 0.0,
    ]
    let art = a["art"] as? String
    if art != artUrl {
      artUrl = art
      loadArtwork(art)
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  /// Position, vitesse et état : le système extrapole l'écoulement du temps tout seul.
  private func nowPlayingState(_ a: [String: Any]?) {
    guard !info.isEmpty else { return }
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = a?["position"] as? Double ?? 0
    info[MPNowPlayingInfoPropertyPlaybackRate] = (a?["playing"] as? Bool ?? false) ? (a?["speed"] as? Double ?? 1) : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func loadArtwork(_ url: String?) {
    guard let url, let u = URL(string: url) else { return }
    URLSession.shared.dataTask(with: u) { [weak self] data, _, _ in
      guard let data, let img = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        guard let self, self.artUrl == url else { return }
        self.info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = self.info
      }
    }.resume()
  }

  private func setupRemote() {
    let c = MPRemoteCommandCenter.shared()
    func on(_ cmd: MPRemoteCommand, _ name: String) {
      cmd.isEnabled = true
      cmd.addTarget { [weak self] _ in
        self?.emit("remote", ["cmd": name])
        return .success
      }
    }
    on(c.playCommand, "play")
    on(c.pauseCommand, "pause")
    on(c.togglePlayPauseCommand, "toggle")
    on(c.nextTrackCommand, "next")
    on(c.previousTrackCommand, "previous")
    c.changePlaybackPositionCommand.isEnabled = true
    c.changePlaybackPositionCommand.addTarget { [weak self] e in
      guard let e = e as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.emit("remote", ["cmd": "seek", "position": e.positionTime])
      return .success
    }
  }
}
