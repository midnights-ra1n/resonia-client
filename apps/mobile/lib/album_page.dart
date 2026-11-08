import 'package:flutter/material.dart';

import 'api.dart';
import 'app_scope.dart';
import 'icons.dart';
import 'l10n/app_localizations.dart';
import 'theme.dart';
import 'widgets.dart';

/// Ouvre un album dans l'onglet courant (la barre d'onglets et le mini-lecteur restent visibles).
void openAlbum(BuildContext context, String albumId) => Navigator.of(context)
    .push(MaterialPageRoute<void>(builder: (_) => AlbumPage(albumId: albumId)));

/// Lance un album depuis le début, ou met en pause / reprend s'il est déjà en cours.
Future<void> playAlbum(BuildContext context, String albumId) async {
  final scope = AppScope.read(context);
  final player = scope.player;
  if (player.current?.albumId == albumId) return player.togglePlay();
  final details = await scope.api.album(albumId);
  await player.playQueue(details.songs);
}

String albumDuration(AppLocalizations l, int seconds) {
  final hours = seconds ~/ 3600;
  final minutes = ((seconds % 3600) / 60).round();
  return hours > 0
      ? l.albumDurationHoursMinutes(hours, minutes)
      : l.albumDurationMinutes(minutes);
}

/// Page album, comme apps/client/src/features/album/AlbumPage.tsx : en-tête teinté par la
/// pochette, Lecture + Lecture aléatoire, liste des titres (le titre en cours en orange).
class AlbumPage extends StatefulWidget {
  const AlbumPage({super.key, required this.albumId});

  final String albumId;

  @override
  State<AlbumPage> createState() => _AlbumPageState();
}

class _AlbumPageState extends State<AlbumPage> {
  late Future<AlbumDetails> _album = AppScope.read(context).api
      .album(widget.albumId);
  final _titleOpacity = ValueNotifier<double>(0);

  @override
  void dispose() {
    _titleOpacity.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.bgBase,
      body: FutureBuilder<AlbumDetails>(
        future: _album,
        builder: (context, snap) {
          final d = snap.data;
          if (snap.hasError) {
            final notFound =
                snap.error is ApiException &&
                (snap.error as ApiException).error == ApiError.unknown;
            return _Fallback(
              message: notFound ? l.albumNotFound : l.homeLoadError,
              onRetry: notFound
                  ? null
                  : () => setState(
                      () =>
                          _album = AppScope.read(context).api
                              .album(widget.albumId),
                    ),
            );
          }
          if (d == null) return const _Fallback(loading: true);
          return Tinted(
            api: AppScope.read(context).api,
            coverArt: d.album.coverArt,
            builder: (context, tint) =>
                NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    // Le titre apparaît dans la barre une fois le nom de l'album passé sous elle.
                    if (n.depth == 0) {
                      _titleOpacity.value = ((n.metrics.pixels - 300) / 60)
                          .clamp(0.0, 1.0);
                    }
                    return false;
                  },
                  child: CustomScrollView(
                    slivers: [
                      _AppBar(
                        title: d.album.name,
                        tint: tint,
                        opacity: _titleOpacity,
                      ),
                      SliverToBoxAdapter(
                        child: _Header(details: d, tint: tint),
                      ),
                      _Tracks(details: d),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 24, 16, 200),
                          child: d.album.year == null
                              ? null
                              : Text(
                                  '© ${d.album.year}',
                                  style: const TextStyle(
                                    color: AppColors.text3,
                                    fontSize: 12,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
          );
        },
      ),
    );
  }
}

class _AppBar extends StatelessWidget {
  const _AppBar({
    required this.title,
    required this.tint,
    required this.opacity,
  });

  final String title;
  final Color? tint;
  final ValueNotifier<double> opacity;

  @override
  Widget build(BuildContext context) {
    final bar = _headerColor(tint);
    return ValueListenableBuilder<double>(
      valueListenable: opacity,
      builder: (context, o, _) => SliverAppBar(
        pinned: true,
        elevation: 0,
        scrolledUnderElevation: 0,
        // Même couleur que le haut du dégradé de l'en-tête : pas de bande noire sous l'encoche.
        backgroundColor: bar,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(AppIcons.arrowBack, color: AppColors.text1),
          tooltip: AppLocalizations.of(context).back,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Opacity(
          opacity: o,
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
      ),
    );
  }
}

/// Teinte d'en-tête : la couleur de la pochette, assombrie pour garder le texte lisible.
Color _headerColor(Color? tint) => tint == null
    ? AppColors.surface3
    : Color.lerp(tint, AppColors.bgBase, 0.35)!;

class _Header extends StatelessWidget {
  const _Header({required this.details, required this.tint});

  final AlbumDetails details;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final scope = AppScope.of(context);
    final player = scope.player;
    final a = details.album;
    final isCurrent = player.current?.albumId == a.id;
    final width = MediaQuery.sizeOf(context).width;
    final meta = [
      l.albumLabel,
      if (a.year != null) '${a.year}',
      l.trackCount(details.songs.length),
      if (details.duration != null) albumDuration(l, details.duration!),
    ].join(' · ');

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [_headerColor(tint), AppColors.bgBase],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Cover(
                api: scope.api,
                coverArt: a.coverArt,
                size: (width * 0.62).clamp(160, 300),
                px: 600,
                elevated: true,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              a.name,
              style: const TextStyle(
                fontSize: 24,
                height: 1.15,
                fontWeight: FontWeight.w800,
                fontVariations: [FontVariation.weight(800)],
              ),
            ),
            if (a.artist != null) ...[
              const SizedBox(height: 8),
              Text(
                a.artist!,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  fontVariations: [FontVariation.weight(700)],
                ),
              ),
            ],
            const SizedBox(height: 4),
            Text(
              meta,
              style: const TextStyle(color: AppColors.text2, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                PlayButton(
                  playing: isCurrent && player.playing,
                  label: isCurrent && player.playing ? l.pause : l.play,
                  onPressed: () => isCurrent
                      ? player.togglePlay()
                      : player.playQueue(details.songs),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: player.toggleShuffle,
                  tooltip: l.shufflePlay,
                  isSelected: player.shuffle,
                  icon: Icon(
                    AppIcons.shuffle,
                    color: player.shuffle ? AppColors.accent : AppColors.text2,
                    size: 28,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Tracks extends StatelessWidget {
  const _Tracks({required this.details});

  final AlbumDetails details;

  @override
  Widget build(BuildContext context) {
    final player = AppScope.of(context).player;
    final songs = details.songs;
    final currentId = player.current?.id;
    return SliverList.builder(
      itemCount: songs.length,
      itemBuilder: (context, i) {
        final s = songs[i];
        final isCurrent = s.id == currentId;
        final color = isCurrent ? AppColors.accent : AppColors.text1;
        return InkWell(
          onTap: () => isCurrent
              ? player.togglePlay()
              : player.playQueue(songs, start: i),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                SizedBox(
                  width: 28,
                  child: Text(
                    '${s.track ?? i + 1}',
                    style: TextStyle(
                      color: isCurrent ? AppColors.accent : AppColors.text2,
                      fontSize: 14,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: color,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          fontVariations: const [FontVariation.weight(500)],
                        ),
                      ),
                      if (s.artist != null)
                        Text(
                          s.artist!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.text2,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                ),
                if (s.duration != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Text(
                      formatDuration(Duration(seconds: s.duration!)),
                      style: const TextStyle(
                        color: AppColors.text2,
                        fontSize: 13,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({this.message, this.onRetry, this.loading = false});

  final String? message;
  final VoidCallback? onRetry;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconButton(
            icon: const Icon(AppIcons.arrowBack, color: AppColors.text1),
            tooltip: l.back,
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          Expanded(
            child: Center(
              child: loading
                  ? const SizedBox.shrink() // chargement court : pas de spinner qui clignote
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          message!,
                          style: const TextStyle(
                            color: AppColors.text2,
                            fontSize: 15,
                          ),
                        ),
                        if (onRetry != null)
                          TextButton(
                            onPressed: onRetry,
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.text1,
                            ),
                            child: Text(l.retry),
                          ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
