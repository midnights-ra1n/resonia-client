import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'api.dart';
import 'icons.dart';
import 'l10n/app_localizations.dart';
import 'theme.dart';

const _quickAccessSize = 8;
const _quickAccessMaxPlaylists = 4;

class _HomeData {
  const _HomeData({required this.playlists, required this.frequent, required this.recent, required this.newest, required this.random});

  final List<Playlist> playlists;
  final List<Album> frequent;
  final List<Album> recent;
  final List<Album> newest;
  final List<Album> random;

  bool get isEmpty => [playlists, frequent, recent, newest, random].every((l) => l.isEmpty);
}

/// Accueil : même contenu que l'accueil du bureau (apps/client/src/features/home/HomePage.tsx).
class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api, required this.leading});

  final SubsonicApi api;
  final Widget leading;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late Future<_HomeData> _data = _load();

  Future<_HomeData> _load() async {
    final api = widget.api;
    // Une section en échec ne masque pas les autres ; tout en échec = erreur affichée.
    var failures = 0;
    Future<List<T>> safe<T>(Future<List<T>> f) => f.catchError((Object _) {
      failures++;
      return <T>[];
    });
    final r = await Future.wait([
      safe(api.playlists()),
      safe(api.albumList(AlbumListType.frequent)),
      safe(api.albumList(AlbumListType.recent)),
      safe(api.albumList(AlbumListType.newest)),
      safe(api.albumList(AlbumListType.random)),
    ]);
    if (failures == r.length) throw const ApiException(ApiError.unreachable);
    return _HomeData(
      playlists: r[0] as List<Playlist>,
      frequent: r[1] as List<Album>,
      recent: r[2] as List<Album>,
      newest: r[3] as List<Album>,
      random: r[4] as List<Album>,
    );
  }

  Future<void> _refresh() {
    final f = _load();
    setState(() => _data = f);
    return f.then((_) {}, onError: (_) {});
  }

  String _greeting(AppLocalizations l) {
    final h = DateTime.now().hour;
    final u = widget.api.session.username;
    if (h >= 5 && h < 12) return l.homeGreetingMorning(u);
    if (h >= 12 && h < 18) return l.homeGreetingAfternoon(u);
    return l.homeGreetingEvening(u);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment(0, -0.2), colors: [AppColors.surface3, AppColors.bgBase]),
      ),
      child: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.surface2,
          onRefresh: _refresh,
          child: FutureBuilder<_HomeData>(
            future: _data,
            builder: (context, snap) {
              final data = snap.data;
              final loading = snap.connectionState != ConnectionState.done;
              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                    sliver: SliverToBoxAdapter(
                      child: Row(
                        children: [
                          widget.leading,
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _greeting(l),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.headlineSmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (loading && data == null)
                    ..._skeleton()
                  else if (snap.hasError)
                    SliverFillRemaining(hasScrollBody: false, child: _Message(text: l.homeLoadError, action: l.retry, onAction: _refresh))
                  else if (data!.isEmpty)
                    SliverFillRemaining(hasScrollBody: false, child: _Message(text: l.homeNoAlbums))
                  else
                    ..._content(l, data),
                  const SliverToBoxAdapter(child: SizedBox(height: 120)), // sous la barre d'onglets
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  List<Widget> _content(AppLocalizations l, _HomeData d) {
    final api = widget.api;
    // Bandeau : le dernier album écouté (à défaut, le plus écouté).
    final hero = d.recent.firstOrNull ?? d.frequent.firstOrNull;
    // Accès rapide : quelques playlists, puis les albums les plus écoutés (sans celui du bandeau).
    final quick = <_QuickItem>[
      for (final p in d.playlists.take(_quickAccessMaxPlaylists)) _QuickItem(p.name, p.coverArt, isPlaylist: true),
      for (final a in d.frequent.where((a) => a.id != hero?.id)) _QuickItem(a.name, a.coverArt),
    ].take(_quickAccessSize).toList();

    return [
      if (hero != null) SliverToBoxAdapter(child: _Hero(api: api, album: hero)),
      if (quick.isNotEmpty) ...[
        _SectionTitle(l.homeQuickAccess),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisExtent: 56,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: quick.length,
            itemBuilder: (_, i) => _QuickTile(api: api, item: quick[i]),
          ),
        ),
      ],
      if (d.playlists.isNotEmpty)
        _Carousel(
          title: l.homeYourPlaylists,
          count: d.playlists.length,
          builder: (i) {
            final p = d.playlists[i];
            return _Card(api: api, coverArt: p.coverArt, title: p.name, subtitle: p.songCount == null ? null : l.trackCount(p.songCount!), isPlaylist: true);
          },
        ),
      for (final (title, albums) in [
        (l.homeMostPlayedAlbums, d.frequent),
        (l.homeRecentlyPlayed, d.recent),
        (l.homeNewReleases, d.newest),
        (l.homeDiscover, d.random),
      ])
        if (albums.isNotEmpty)
          _Carousel(
            title: title,
            count: albums.length,
            builder: (i) => _Card(api: api, coverArt: albums[i].coverArt, title: albums[i].name, subtitle: albums[i].artist),
          ),
    ];
  }

  List<Widget> _skeleton() => [
    const SliverToBoxAdapter(
      child: Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: _Box(height: 152)),
    ),
    const SliverToBoxAdapter(child: SizedBox(height: 32)),
    SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      sliver: SliverGrid.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisExtent: 56, mainAxisSpacing: 8, crossAxisSpacing: 8),
        itemCount: _quickAccessSize,
        itemBuilder: (_, _) => const _Box(height: 56),
      ),
    ),
  ];
}

/// Bandeau « Reprendre l'écoute » : halo de la couleur dominante de la pochette, dégradé statique.
class _Hero extends StatefulWidget {
  const _Hero({required this.api, required this.album});

  final SubsonicApi api;
  final Album album;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  Color? _tint;

  @override
  void initState() {
    super.initState();
    _computeTint();
  }

  @override
  void didUpdateWidget(_Hero old) {
    super.didUpdateWidget(old);
    if (old.album.coverArt != widget.album.coverArt) _computeTint();
  }

  /// Moyenne des pixels d'une miniature 32 px, comme useDominantColor côté web.
  Future<void> _computeTint() async {
    final cover = widget.album.coverArt;
    if (cover == null) return;
    try {
      final codec = await ui.instantiateImageCodec(await widget.api.bytes(widget.api.coverUrl(cover, 32)), targetWidth: 16);
      final image = (await codec.getNextFrame()).image;
      final px = (await image.toByteData())!;
      image.dispose();
      codec.dispose();
      var r = 0, g = 0, b = 0;
      final n = px.lengthInBytes ~/ 4;
      for (var i = 0; i < px.lengthInBytes; i += 4) {
        r += px.getUint8(i);
        g += px.getUint8(i + 1);
        b += px.getUint8(i + 2);
      }
      if (mounted && cover == widget.album.coverArt) setState(() => _tint = Color.fromARGB(255, r ~/ n, g ~/ n, b ~/ n));
    } catch (_) {
      // Pas de halo si la miniature est indisponible.
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final a = widget.album;
    final meta = [a.artist, a.year?.toString(), if (a.songCount != null) l.trackCount(a.songCount!)].whereType<String>().join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: _tint == null ? AppColors.surface2 : null,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0x0DFFFFFF)),
          gradient: _tint == null
              ? null
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color.alphaBlend(_tint!.withValues(alpha: 0.6), AppColors.surface2), AppColors.surface2],
                  stops: const [0, 0.75],
                ),
        ),
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Cover(api: widget.api, coverArt: a.coverArt, size: 120, px: 400, elevated: true),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l.homeResumeListening.toUpperCase(),
                    style: const TextStyle(color: AppColors.accent, fontSize: 11, letterSpacing: 1.3, fontVariations: [FontVariation.weight(500)]),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    a.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 24, height: 1.1, fontWeight: FontWeight.w800, fontVariations: [FontVariation.weight(800)]),
                  ),
                  const SizedBox(height: 6),
                  Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.text2, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickItem {
  const _QuickItem(this.name, this.coverArt, {this.isPlaylist = false});
  final String name;
  final String? coverArt;
  final bool isPlaylist;
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({required this.api, required this.item});

  final SubsonicApi api;
  final _QuickItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(6)),
      child: Row(
        children: [
          Cover(api: api, coverArt: item.coverArt, size: 56, px: 168, radius: 0, isPlaylist: item.isPlaylist),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, height: 1.25, fontWeight: FontWeight.w600, fontVariations: [FontVariation.weight(600)]),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 12),
      sliver: SliverToBoxAdapter(
        child: Text(text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, fontVariations: [FontVariation.weight(700)])),
      ),
    );
  }
}

class _Carousel extends StatelessWidget {
  const _Carousel({required this.title, required this.count, required this.builder});

  final String title;
  final int count;
  final Widget Function(int) builder;

  @override
  Widget build(BuildContext context) {
    return SliverMainAxisGroup(
      slivers: [
        _SectionTitle(title),
        SliverToBoxAdapter(
          child: SizedBox(
            height: _Card.heightFor(MediaQuery.textScalerOf(context)),
            // builder : seules les cartes visibles sont construites et leurs pochettes chargées.
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: count,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (_, i) => builder(i),
            ),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.api, required this.coverArt, required this.title, this.subtitle, this.isPlaylist = false});

  static const size = 140.0;
  static const _title = TextStyle(fontSize: 14, height: 1.4, fontWeight: FontWeight.w500, fontVariations: [FontVariation.weight(500)]);
  static const _subtitle = TextStyle(color: AppColors.text2, fontSize: 13, height: 1.4);

  /// Hauteur du carrousel : suit la taille de texte choisie dans les réglages d'accessibilité.
  static double heightFor(TextScaler s) => (size + 8 + s.scale(_title.fontSize!) * 1.4 + s.scale(_subtitle.fontSize!) * 1.4).ceilToDouble() + 1;

  final SubsonicApi api;
  final String? coverArt;
  final String title;
  final String? subtitle;
  final bool isPlaylist;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Cover(api: api, coverArt: coverArt, size: size, px: 450, isPlaylist: isPlaylist, elevated: true),
          const SizedBox(height: 8),
          Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: _title),
          if (subtitle != null) Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: _subtitle),
        ],
      ),
    );
  }
}

/// Pochette carrée. `px` = taille demandée au serveur ET taille de décodage en mémoire :
/// jamais d'image pleine résolution gardée en RAM pour une vignette.
class Cover extends StatelessWidget {
  const Cover({
    super.key,
    required this.api,
    required this.coverArt,
    required this.size,
    required this.px,
    this.radius = 6,
    this.isPlaylist = false,
    this.elevated = false,
  });

  final SubsonicApi api;
  final String? coverArt;
  final double size;
  final int px;
  final double radius;
  final bool isPlaylist;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final placeholder = Center(
      child: Icon(isPlaylist ? AppIcons.queueMusic : AppIcons.musicNote, color: AppColors.text3, size: size * 0.35),
    );
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surface3,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: elevated ? const [BoxShadow(color: Color(0x66000000), blurRadius: 16, offset: Offset(0, 6))] : null,
      ),
      child: coverArt == null
          ? placeholder
          : Image.network(
              api.coverUrl(coverArt!, px),
              cacheWidth: px,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              errorBuilder: (_, _, _) => placeholder,
              frameBuilder: (_, child, frame, sync) => sync
                  ? child
                  : AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: const Duration(milliseconds: 220), curve: Curves.easeOut, child: child),
            ),
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.height});
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(height: height, decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(8)));
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, this.action, this.onAction});

  final String text;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.text2, fontSize: 15)),
          if (action != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: onAction,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.text1,
                side: const BorderSide(color: AppColors.borderStrong),
                shape: const StadiumBorder(),
              ),
              child: Text(action!),
            ),
          ],
        ],
      ),
    );
  }
}
