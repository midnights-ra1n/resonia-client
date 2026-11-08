import 'dart:async';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../app_scope.dart';
import '../icons.dart';
import '../l10n/app_localizations.dart';
import '../theme.dart';
import '../widgets.dart';
import 'player.dart';

/// Fond teinté par la pochette, assombri pour garder le texte lisible.
Color _tinted(Color? tint, double darken) => tint == null
    ? AppColors.surface3
    : Color.lerp(tint, AppColors.bgSunken, darken)!;

String pitchLabel(double pitch) =>
    pitch == 0 ? '1x' : '${pitch > 0 ? '+' : ''}${pitch.toStringAsFixed(1)}%';

/// Position de lecture, à [period] près. Une seule minuterie, et seulement quand la position
/// bouge et se voit : rien en pause, app en arrière-plan ou page recouverte (batterie).
class _Position extends StatefulWidget {
  const _Position({
    required this.player,
    required this.period,
    required this.builder,
  });

  final AudioPlayer player;
  final Duration period;
  final Widget Function(BuildContext, Duration position, Duration duration)
  builder;

  @override
  State<_Position> createState() => _PositionState();
}

class _PositionState extends State<_Position> with WidgetsBindingObserver {
  final _subs = <StreamSubscription<Object?>>[];
  Timer? _timer;
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Saut, changement de piste, lecture / pause : affichage à jour tout de suite.
    _subs
      ..add(widget.player.playbackEventStream.listen((_) => _refresh()))
      ..add(widget.player.playingStream.listen((_) => _refresh()));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible =
        TickerMode.valuesOf(context).enabled &&
        (ModalRoute.isCurrentOf(context) ?? true);
    _sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => _refresh();

  void _refresh() {
    if (!mounted) return;
    setState(() {});
    _sync();
  }

  void _sync() {
    final state = WidgetsBinding.instance.lifecycleState;
    final run =
        widget.player.playing &&
        _visible &&
        (state == null ||
            state == AppLifecycleState.resumed ||
            state == AppLifecycleState.inactive);
    if (run == (_timer != null)) return;
    _timer?.cancel();
    _timer = run ? Timer.periodic(widget.period, (_) => setState(() {})) : null;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(
    context,
    widget.player.position,
    widget.player.duration ?? Duration.zero,
  );
}

/// Mini-lecteur façon Spotify, au-dessus de la barre d'onglets. Toucher = lecteur plein écran.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final player = scope.player;
    final song = player.current;
    if (song == null) return const SizedBox.shrink();
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
      child: Tinted(
        api: scope.api,
        coverArt: song.coverArt,
        builder: (context, tint) => Material(
          color: _tinted(tint, 0.55),
          borderRadius: BorderRadius.circular(8),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => openNowPlaying(context),
            child: SizedBox(
              height: 56,
              child: Stack(
                children: [
                  Row(
                    children: [
                      const SizedBox(width: 8),
                      Cover(
                        api: scope.api,
                        coverArt: song.coverArt,
                        size: 40,
                        px: 120,
                        radius: 4,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              song.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                fontVariations: [FontVariation.weight(600)],
                              ),
                            ),
                            if (song.artist != null)
                              Text(
                                song.artist!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.text2,
                                  fontSize: 12,
                                ),
                              ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: player.togglePlay,
                        tooltip: player.playing ? l.pause : l.play,
                        icon: Icon(
                          player.playing ? AppIcons.pause : AppIcons.playArrow,
                          fill: 1,
                          color: AppColors.text1,
                          size: 30,
                        ),
                      ),
                      const SizedBox(width: 4),
                    ],
                  ),
                  Positioned(
                    left: 8,
                    right: 8,
                    bottom: 0,
                    child: _Position(
                      player: player.player,
                      period: const Duration(seconds: 1),
                      builder: (context, pos, dur) => LinearProgressIndicator(
                        value: dur.inMilliseconds == 0
                            ? 0
                            : (pos.inMilliseconds / dur.inMilliseconds).clamp(
                                0.0,
                                1.0,
                              ),
                        minHeight: 2,
                        borderRadius: BorderRadius.circular(1),
                        color: AppColors.text1,
                        backgroundColor: const Color(0x33FFFFFF),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Le lecteur monte depuis le bas ; la page dessous reste visible pendant qu'on le rabaisse.
void openNowPlaying(BuildContext context) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: false,
        transitionDuration: const Duration(milliseconds: 300),
        reverseTransitionDuration: const Duration(milliseconds: 250),
        pageBuilder: (_, _, _) => const NowPlayingPage(),
        transitionsBuilder: (_, animation, _, child) => SlideTransition(
          position: Tween(begin: const Offset(0, 1), end: Offset.zero).animate(
            CurvedAnimation(
              parent: animation,
              curve: Curves.easeOutCubic,
              reverseCurve: Curves.easeInCubic,
            ),
          ),
          child: child,
        ),
      ),
    );

/// Lecteur plein écran. Sur la pochette : glisser vers le bas pour revenir au mini-lecteur,
/// vers la gauche / la droite pour le titre suivant / précédent.
class NowPlayingPage extends StatefulWidget {
  const NowPlayingPage({super.key});

  @override
  State<NowPlayingPage> createState() => _NowPlayingPageState();
}

class _NowPlayingPageState extends State<NowPlayingPage>
    with TickerProviderStateMixin {
  // Décalages suivant le doigt ; animés pour revenir en place ou changer de titre.
  late final _dx = AnimationController.unbounded(vsync: this);
  late final _dy = AnimationController.unbounded(vsync: this);

  @override
  void dispose() {
    _dx.dispose();
    _dy.dispose();
    super.dispose();
  }

  void _onVerticalEnd(DragEndDetails d) {
    if (_dy.value > 120 || (d.primaryVelocity ?? 0) > 700) {
      Navigator.of(context).pop();
    } else {
      _dy.animateTo(
        0,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    }
  }

  Future<void> _onHorizontalEnd(
    DragEndDetails d,
    double width,
    PlayerController player,
  ) async {
    final v = d.primaryVelocity ?? 0;
    final next = (_dx.value < -width / 4 || v < -600) && player.player.hasNext;
    final previous = _dx.value > width / 4 || v > 600;
    if (!next && !previous) {
      await _dx.animateTo(
        0,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
      return;
    }
    // La pochette sort d'un côté, la suivante entre par l'autre.
    final out = (next ? -1 : 1) * (width + 48);
    await _dx.animateTo(
      out,
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeIn,
    );
    next ? player.next() : player.previous();
    _dx.value = -out;
    await _dx.animateTo(
      0,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final player = scope.player;
    final song = player.current;
    final l = AppLocalizations.of(context);
    if (song == null) return const Scaffold(backgroundColor: AppColors.bgBase);
    // Pleine largeur, sauf sur un écran bas (iPhone SE, paysage) : ~340 px pour le reste.
    final mq = MediaQuery.of(context);
    final cover = (mq.size.width - 48)
        .clamp(0.0, mq.size.height - mq.padding.vertical - 340)
        .clamp(120.0, double.infinity);
    final page = Tinted(
      api: scope.api,
      coverArt: song.coverArt,
      builder: (context, tint) => Scaffold(
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [_tinted(tint, 0.3), AppColors.bgBase],
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        tooltip: l.close,
                        icon: const Icon(
                          AppIcons.keyboardArrowDown,
                          color: AppColors.text1,
                          size: 32,
                        ),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              l.albumLabel.toUpperCase(),
                              style: const TextStyle(
                                color: AppColors.text2,
                                fontSize: 11,
                                letterSpacing: 1.2,
                              ),
                            ),
                            if (song.album != null)
                              Text(
                                song.album!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  fontVariations: [FontVariation.weight(700)],
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 48),
                    ],
                  ),
                  // Flex 3 / 3 / 2 : l'ensemble est un peu remonté plutôt que centré.
                  const Spacer(flex: 3),
                  GestureDetector(
                    onHorizontalDragUpdate: (d) => _dx.value += d.delta.dx,
                    onHorizontalDragEnd: (d) =>
                        _onHorizontalEnd(d, cover, player),
                    onVerticalDragUpdate: (d) => _dy.value =
                        (_dy.value + d.delta.dy).clamp(0.0, double.infinity),
                    onVerticalDragEnd: _onVerticalEnd,
                    child: AnimatedBuilder(
                      animation: _dx,
                      builder: (_, child) => Transform.translate(
                        offset: Offset(_dx.value, 0),
                        child: child,
                      ),
                      child: Cover(
                        api: scope.api,
                        coverArt: song.coverArt,
                        size: cover,
                        px: 900,
                        radius: 8,
                        elevated: true,
                      ),
                    ),
                  ),
                  const Spacer(flex: 3),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          song.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 22,
                            height: 1.2,
                            fontWeight: FontWeight.w800,
                            fontVariations: [FontVariation.weight(800)],
                          ),
                        ),
                        if (song.artist != null)
                          Text(
                            song.artist!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.text2,
                              fontSize: 15,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _SeekBar(player: player),
                  _Controls(player: player),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Spacer(),
                      TextButton(
                        onPressed: () => showPitchSheet(context),
                        style: TextButton.styleFrom(
                          foregroundColor: player.pitch != 0
                              ? AppColors.accent
                              : AppColors.text2,
                          shape: const StadiumBorder(),
                          // Remplace le style du thème : on repart de lui pour garder Geist.
                          textStyle: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                fontVariations: const [
                                  FontVariation.weight(600),
                                ],
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                        ),
                        child: Text(
                          pitchLabel(player.pitch),
                          semanticsLabel:
                              '${l.pitchTitle} ${pitchLabel(player.pitch)}',
                        ),
                      ),
                    ],
                  ),
                  const Spacer(flex: 2),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    // Seule la translation est recalculée pendant le glissé, pas la page.
    return AnimatedBuilder(
      animation: _dy,
      builder: (_, child) =>
          Transform.translate(offset: Offset(0, _dy.value), child: child),
      child: page,
    );
  }
}

class _SeekBar extends StatefulWidget {
  const _SeekBar({required this.player});

  final PlayerController player;

  @override
  State<_SeekBar> createState() => _SeekBarState();
}

class _SeekBarState extends State<_SeekBar> {
  double?
  _dragging; // ms pendant un glissé : la position affichée suit le doigt

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return _Position(
      player: widget.player.player,
      period: const Duration(milliseconds: 250),
      builder: (context, pos, dur) {
        final max = dur.inMilliseconds.toDouble();
        final value = (_dragging ?? pos.inMilliseconds.toDouble()).clamp(
          0.0,
          max > 0 ? max : 0.0,
        );
        final shown = Duration(milliseconds: value.round());
        return Column(
          children: [
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 4,
                activeTrackColor: AppColors.text1,
                inactiveTrackColor: const Color(0x33FFFFFF),
                thumbColor: AppColors.text1,
                overlayColor: const Color(0x22FFFFFF),
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                trackShape: const RoundedRectSliderTrackShape(),
                padding: EdgeInsets.zero,
              ),
              child: Slider(
                value: value,
                max: max > 0 ? max : 1,
                semanticFormatterCallback: (_) =>
                    '${l.playbackPosition} ${formatDuration(shown)} / ${formatDuration(dur)}',
                onChanged: max > 0
                    ? (v) => setState(() => _dragging = v)
                    : null,
                onChangeEnd: (v) async {
                  await widget.player.seek(Duration(milliseconds: v.round()));
                  if (mounted) setState(() => _dragging = null);
                },
              ),
            ),
            const SizedBox(height: 6),
            // merge : garde Geist (un DefaultTextStyle simple remplace toute la police).
            DefaultTextStyle.merge(
              style: const TextStyle(
                color: AppColors.text2,
                fontSize: 12,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(formatDuration(shown)),
                  Text('-${formatDuration(dur - shown)}'),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({required this.player});

  final PlayerController player;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final loop = player.loopMode;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          onPressed: player.toggleShuffle,
          tooltip: l.shufflePlay,
          isSelected: player.shuffle,
          icon: Icon(
            AppIcons.shuffle,
            color: player.shuffle ? AppColors.accent : AppColors.text2,
            size: 26,
          ),
        ),
        IconButton(
          onPressed: player.previous,
          tooltip: l.previous,
          icon: const Icon(
            AppIcons.skipPrevious,
            fill: 1,
            color: AppColors.text1,
            size: 40,
          ),
        ),
        PlayButton(
          playing: player.playing,
          label: player.playing ? l.pause : l.play,
          size: 68,
          color: AppColors.text1,
          iconColor: AppColors.bgBase,
          onPressed: player.togglePlay,
        ),
        IconButton(
          onPressed: player.next,
          tooltip: l.next,
          icon: const Icon(
            AppIcons.skipNext,
            fill: 1,
            color: AppColors.text1,
            size: 40,
          ),
        ),
        IconButton(
          onPressed: player.cycleRepeat,
          tooltip: switch (loop) {
            LoopMode.off => l.repeatOff,
            LoopMode.all => l.repeatAll,
            LoopMode.one => l.repeatOne,
          },
          icon: Icon(
            loop == LoopMode.one ? AppIcons.repeatOne : AppIcons.repeat,
            color: loop == LoopMode.off ? AppColors.text2 : AppColors.accent,
            size: 26,
          ),
        ),
      ],
    );
  }
}

// ───────────────────────── Pitch ─────────────────────────

void showPitchSheet(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  backgroundColor: AppColors.surface2,
  showDragHandle: true,
  builder: (_) => const PitchSheet(),
);

/// Même réglages que le menu Pitch du bureau (features/player/PitchMenu.tsx) : fader,
/// réinitialisation, plage et Master Tempo.
class PitchSheet extends StatelessWidget {
  const PitchSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final player = AppScope.of(context).player;
    final l = AppLocalizations.of(context);
    const small = TextStyle(color: AppColors.text2, fontSize: 12);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.pitchTitle, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                PitchFader(
                  pitch: player.pitch,
                  range: player.pitchRange,
                  onChanged: player.setPitch,
                ),
                const SizedBox(width: 24),
                Column(
                  children: [
                    SizedBox(
                      width: 64,
                      child: Text(
                        player.pitch == 0 ? '0%' : pitchLabel(player.pitch),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          fontVariations: [FontVariation.weight(700)],
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: player.resetPitch,
                      tooltip: l.pitchReset,
                      icon: const Icon(
                        AppIcons.history,
                        color: AppColors.text2,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 20),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(l.pitchRange, style: small),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final r in pitchRanges)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: _Pill(
                        label: '±$r',
                        selected: player.pitchRange == r,
                        onTap: () => player.setPitchRange(r),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: player.masterTempo,
              onChanged: (_) => player.toggleMasterTempo(),
              activeTrackColor: AppColors.accent,
              title: Text(
                l.pitchMasterTempo,
                style: const TextStyle(fontSize: 14),
              ),
              subtitle: Text(l.pitchMasterTempoHint, style: small),
            ),
            Text(
              l.pitchHint,
              style: const TextStyle(color: AppColors.text3, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.accent : AppColors.surface3,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: selected ? AppColors.onAccent : AppColors.text1,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                fontVariations: [FontVariation.weight(selected ? 700 : 400)],
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Fader vertical de platine : −plage en haut, +plage en bas (comme le bureau), remplissage
/// orange depuis le centre (0 %), pas de 0,1 %.
class PitchFader extends StatelessWidget {
  const PitchFader({
    super.key,
    required this.pitch,
    required this.range,
    required this.onChanged,
  });

  final double pitch;
  final int range;
  final ValueChanged<double> onChanged;

  static const height = 200.0;
  static const width = 44.0;

  void _fromDy(double dy) =>
      onChanged(-range + (dy / height).clamp(0.0, 1.0) * 2 * range);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Semantics(
      slider: true,
      label: l.pitchTitle,
      value: pitchLabel(pitch),
      increasedValue: pitchLabel((pitch + 0.1).clamp(-range, range).toDouble()),
      decreasedValue: pitchLabel((pitch - 0.1).clamp(-range, range).toDouble()),
      onIncrease: () => onChanged(pitch + 0.1),
      onDecrease: () => onChanged(pitch - 0.1),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (d) => _fromDy(d.localPosition.dy),
        onVerticalDragUpdate: (d) => _fromDy(d.localPosition.dy),
        child: CustomPaint(
          size: const Size(width, height),
          painter: _FaderPainter(pitch / range),
        ),
      ),
    );
  }
}

class _FaderPainter extends CustomPainter {
  _FaderPainter(this.ratio); // -1 … 1

  final double ratio;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final y = (ratio + 1) / 2 * size.height;
    final track = RRect.fromRectAndRadius(
      Rect.fromLTWH(cx - 2, 0, 4, size.height),
      const Radius.circular(2),
    );
    canvas.drawRRect(track, Paint()..color = AppColors.borderStrong);
    final mid = size.height / 2;
    canvas.drawRect(
      Rect.fromLTRB(cx - 2, y < mid ? y : mid, cx + 2, y < mid ? mid : y),
      Paint()..color = AppColors.accent,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, y), width: 26, height: 10),
        const Radius.circular(3),
      ),
      Paint()..color = AppColors.text1,
    );
  }

  @override
  bool shouldRepaint(_FaderPainter old) => old.ratio != ratio;
}
