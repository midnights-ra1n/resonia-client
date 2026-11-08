import 'dart:async';

import 'package:just_audio_platform_interface/just_audio_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Lecteur natif simulé : retient ce que just_audio lui demande (index, position, vitesse,
/// pitch) et renvoie les évènements attendus. Pas de son, pas de temps qui passe.
class FakeJustAudio extends JustAudioPlatform with MockPlatformInterfaceMixin {
  final players = <FakePlayer>[];

  @override
  Future<AudioPlayerPlatform> init(InitRequest request) async {
    final p = FakePlayer(request.id);
    players.add(p);
    return p;
  }

  @override
  Future<DisposePlayerResponse> disposePlayer(
    DisposePlayerRequest request,
  ) async => DisposePlayerResponse();

  @override
  Future<DisposeAllPlayersResponse> disposeAllPlayers(
    DisposeAllPlayersRequest request,
  ) async => DisposeAllPlayersResponse();
}

class FakePlayer extends AudioPlayerPlatform {
  FakePlayer(super.id);

  final _events = StreamController<PlaybackEventMessage>.broadcast();
  int? index;
  Duration position = Duration.zero;
  double speed = 1;
  double pitch = 1;
  Completer<void>? _playing;

  void _emit() => _events.add(
    PlaybackEventMessage(
      processingState: ProcessingStateMessage.ready,
      updateTime: DateTime.now(),
      updatePosition: position,
      bufferedPosition: position,
      duration: const Duration(minutes: 3),
      icyMetadata: null,
      currentIndex: index,
      androidAudioSessionId: null,
    ),
  );

  @override
  Stream<PlaybackEventMessage> get playbackEventMessageStream => _events.stream;

  @override
  Stream<PlayerDataMessage> get playerDataMessageStream => const Stream.empty();

  @override
  Future<LoadResponse> load(LoadRequest request) async {
    index = request.initialIndex ?? 0;
    position = request.initialPosition ?? Duration.zero;
    _emit();
    return LoadResponse(duration: const Duration(minutes: 3));
  }

  @override
  Future<PlayResponse> play(PlayRequest request) async {
    _playing = Completer();
    await _playing!.future; // comme le vrai : se termine à la pause
    return PlayResponse();
  }

  @override
  Future<PauseResponse> pause(PauseRequest request) async {
    _playing?.complete();
    _playing = null;
    _emit();
    return PauseResponse();
  }

  @override
  Future<SeekResponse> seek(SeekRequest request) async {
    position = request.position ?? Duration.zero;
    index = request.index ?? index;
    _emit();
    return SeekResponse();
  }

  @override
  Future<SetSpeedResponse> setSpeed(SetSpeedRequest request) async {
    speed = request.speed;
    return SetSpeedResponse();
  }

  @override
  Future<SetPitchResponse> setPitch(SetPitchRequest request) async {
    pitch = request.pitch;
    return SetPitchResponse();
  }

  @override
  Future<SetVolumeResponse> setVolume(SetVolumeRequest request) async =>
      SetVolumeResponse();
  @override
  Future<SetSkipSilenceResponse> setSkipSilence(
    SetSkipSilenceRequest request,
  ) async => SetSkipSilenceResponse();
  @override
  Future<SetLoopModeResponse> setLoopMode(SetLoopModeRequest request) async =>
      SetLoopModeResponse();
  @override
  Future<SetShuffleModeResponse> setShuffleMode(
    SetShuffleModeRequest request,
  ) async => SetShuffleModeResponse();
  @override
  Future<SetShuffleOrderResponse> setShuffleOrder(
    SetShuffleOrderRequest request,
  ) async => SetShuffleOrderResponse();
  @override
  Future<SetAutomaticallyWaitsToMinimizeStallingResponse>
  setAutomaticallyWaitsToMinimizeStalling(
    SetAutomaticallyWaitsToMinimizeStallingRequest request,
  ) async => SetAutomaticallyWaitsToMinimizeStallingResponse();
  @override
  Future<SetCanUseNetworkResourcesForLiveStreamingWhilePausedResponse>
  setCanUseNetworkResourcesForLiveStreamingWhilePaused(
    SetCanUseNetworkResourcesForLiveStreamingWhilePausedRequest request,
  ) async => SetCanUseNetworkResourcesForLiveStreamingWhilePausedResponse();
  @override
  Future<SetPreferredPeakBitRateResponse> setPreferredPeakBitRate(
    SetPreferredPeakBitRateRequest request,
  ) async => SetPreferredPeakBitRateResponse();
  @override
  Future<SetAllowsExternalPlaybackResponse> setAllowsExternalPlayback(
    SetAllowsExternalPlaybackRequest request,
  ) async => SetAllowsExternalPlaybackResponse();
  @override
  Future<SetAndroidAudioAttributesResponse> setAndroidAudioAttributes(
    SetAndroidAudioAttributesRequest request,
  ) async => SetAndroidAudioAttributesResponse();
  @override
  Future<DisposeResponse> dispose(DisposeRequest request) async {
    _playing?.complete();
    await _events.close();
    return DisposeResponse();
  }
}
