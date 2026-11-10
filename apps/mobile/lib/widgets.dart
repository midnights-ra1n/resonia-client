import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'api.dart';
import 'icons.dart';
import 'theme.dart';

/// Dossier du cache des pochettes (remplaçable en test, où path_provider n'existe pas).
@visibleForTesting
Future<Directory?>? coverCacheDir;
final _inflight = <String, Future<Uint8List>>{};

/// Taille demandée au serveur : 3 paliers seulement, pour qu'une même pochette serve à
/// plusieurs écrans (un seul téléchargement, un seul fichier).
int _tier(int px) => px <= 200
    ? 200
    : px <= 600
    ? 600
    : 1000;

/// Octets d'une pochette : depuis le disque, sinon téléchargée une fois (même connexion que
/// l'API) puis gardée. Navidrome change l'id de pochette quand l'image change.
// shortcut: pas de plafond de taille (~50 Ko par pochette, dossier cache que l'OS peut vider) ;
// ajouter une éviction LRU comme AudioCache si des bibliothèques énormes le demandent.
Future<Uint8List> coverBytes(SubsonicApi api, String coverArt, int px) {
  final key = '${api.session.url} $coverArt ${_tier(px)}';
  // Même pochette demandée par plusieurs écrans en même temps : un seul téléchargement.
  return _inflight[key] ??= _coverBytes(api, coverArt, _tier(px)).whenComplete(
    () {
      // Bloc { } : renvoyer la future retirée la ferait s'attendre elle-même.
      _inflight.remove(key);
    },
  );
}

Future<Uint8List> _coverBytes(
  SubsonicApi api,
  String coverArt,
  int size,
) async {
  final dir = await (coverCacheDir ??= getApplicationCacheDirectory()
      .then((d) => Directory('${d.path}/covers').create(recursive: true))
      .then<Directory?>((d) => d, onError: (_) => null));
  final server = md5
      .convert(utf8.encode(api.session.url))
      .toString()
      .substring(0, 8);
  final name =
      '${server}_${coverArt.replaceAll(RegExp(r'[^\w.-]'), '_')}_$size';
  final file = dir == null ? null : File('${dir.path}/$name');
  if (file != null && file.existsSync()) {
    try {
      return await file.readAsBytes();
    } catch (_) {}
  }
  final bytes = await api.bytes(api.coverUrl(coverArt, size));
  if (file != null) {
    // Écriture atomique : jamais de fichier tronqué relu au prochain lancement.
    final tmp = File('${file.path}.tmp');
    unawaited(
      tmp
          .writeAsBytes(bytes)
          .then((t) => t.rename(file.path))
          .then<void>((_) {}, onError: (_) {}),
    );
  }
  return bytes;
}

/// Pochette (cache disque + mémoire), décodée à [width] px seulement.
class CoverImage extends ImageProvider<CoverImage> {
  const CoverImage(this.api, this.coverArt, this.width);

  final SubsonicApi api;
  final String coverArt;
  final int width;

  @override
  Future<CoverImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(CoverImage key, ImageDecoderCallback decode) =>
      MultiFrameImageStreamCompleter(codec: _load(decode), scale: 1);

  Future<ui.Codec> _load(ImageDecoderCallback decode) async => decode(
    await ui.ImmutableBuffer.fromUint8List(
      await coverBytes(api, coverArt, width),
    ),
    getTargetSize: (w, h) => ui.TargetImageSize(width: width < w ? width : w),
  );

  @override
  bool operator ==(Object other) =>
      other is CoverImage &&
      other.api.session.url == api.session.url &&
      other.coverArt == coverArt &&
      other.width == width;

  @override
  int get hashCode => Object.hash(api.session.url, coverArt, width);
}

final _tints = <String, Future<Color?>>{};

/// Couleur moyenne de la pochette (petit palier, déjà en cache pour les vignettes), comme
/// useDominantColor côté web. Calculée une seule fois par session.
Future<Color?> dominantColor(SubsonicApi api, String? coverArt) {
  if (coverArt == null) return Future.value();
  return _tints[coverArt] ??= () async {
    try {
      final codec = await ui.instantiateImageCodec(
        await coverBytes(api, coverArt, 200),
        targetWidth: 16,
      );
      final image = (await codec.getNextFrame()).image;
      final px = (await image.toByteData())!;
      image.dispose();
      codec.dispose();
      // Moyenne pondérée par la saturation : une pochette verte avec un peu de blanc donne du vert,
      // pas un gris terne (comme la couleur dominante d'un lecteur Spotify).
      var r = 0.0, g = 0.0, b = 0.0, total = 0.0;
      for (var i = 0; i < px.lengthInBytes; i += 4) {
        final pr = px.getUint8(i),
            pg = px.getUint8(i + 1),
            pb = px.getUint8(i + 2);
        final hi = pr > pg ? (pr > pb ? pr : pb) : (pg > pb ? pg : pb);
        final lo = pr < pg ? (pr < pb ? pr : pb) : (pg < pb ? pg : pb);
        final w = 0.05 + (hi == 0 ? 0 : (hi - lo) / hi);
        r += pr * w;
        g += pg * w;
        b += pb * w;
        total += w;
      }
      return Color.fromARGB(
        255,
        (r / total).round(),
        (g / total).round(),
        (b / total).round(),
      );
    } catch (_) {
      _tints.remove(coverArt); // réessayé à la prochaine demande
      return null;
    }
  }();
}

/// Rebâtit [builder] avec la couleur dominante une fois connue (null avant / en cas d'échec).
class Tinted extends StatelessWidget {
  const Tinted({
    super.key,
    required this.api,
    required this.coverArt,
    required this.builder,
  });

  final SubsonicApi api;
  final String? coverArt;
  final Widget Function(BuildContext, Color?) builder;

  @override
  Widget build(BuildContext context) => FutureBuilder<Color?>(
    future: dominantColor(api, coverArt),
    builder: (context, snap) => builder(context, snap.data),
  );
}

/// 3:07, ou 1:02:03 au-delà d'une heure.
String formatDuration(Duration d) {
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  if (d.inHours > 0) {
    return '${d.inHours}:${d.inMinutes.remainder(60).toString().padLeft(2, '0')}:$s';
  }
  return '${d.inMinutes}:$s';
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
      child: Icon(
        isPlaylist ? AppIcons.queueMusic : AppIcons.musicNote,
        color: AppColors.text3,
        size: size * 0.35,
      ),
    );
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surface3,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: elevated
            ? const [
                BoxShadow(
                  color: Color(0x66000000),
                  blurRadius: 16,
                  offset: Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: coverArt == null
          ? placeholder
          : Image(
              image: CoverImage(api, coverArt!, px),
              fit: BoxFit.cover,
              gaplessPlayback: true,
              errorBuilder: (_, _, _) => placeholder,
              frameBuilder: (_, child, frame, sync) => sync
                  ? child
                  : AnimatedOpacity(
                      opacity: frame == null ? 0 : 1,
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOut,
                      child: child,
                    ),
            ),
    );
  }
}

/// Bouton rond Lecture / Pause : orange (le seul élément orange plein d'un écran, règle web),
/// blanc dans le lecteur plein écran comme sur le bureau.
class PlayButton extends StatelessWidget {
  const PlayButton({
    super.key,
    required this.playing,
    required this.onPressed,
    this.size = 56,
    required this.label,
    this.color = AppColors.accent,
    this.iconColor = AppColors.onAccent,
  });

  final bool playing;
  final VoidCallback? onPressed;
  final double size;
  final String label;
  final Color color;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: color,
        shape: const CircleBorder(),
        elevation: 0,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(
              playing ? AppIcons.pause : AppIcons.playArrow,
              fill: 1,
              color: iconColor,
              size: size * 0.5,
            ),
          ),
        ),
      ),
    );
  }
}

/// Barre de lecture en « chargement infini » : un segment qui glisse sans fin, à la place de la
/// barre normale ([child]) quand un titre tarde à démarrer (comme Spotify). N'apparaît qu'après
/// 200 ms : un démarrage instantané (cache) ne la fait jamais clignoter. Rien n'est animé hors
/// chargement (batterie).
class LoadingBar extends StatefulWidget {
  const LoadingBar({
    super.key,
    required this.loading,
    required this.height,
    required this.color,
    required this.trackColor,
    required this.child,
  });

  final bool loading;
  final double height;
  final Color color;
  final Color trackColor;
  final Widget child;

  @override
  State<LoadingBar> createState() => _LoadingBarState();
}

class _LoadingBarState extends State<LoadingBar>
    with SingleTickerProviderStateMixin {
  late final _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );
  Timer? _delay;
  bool _shown = false;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(LoadingBar old) {
    super.didUpdateWidget(old);
    if (old.loading != widget.loading) _sync();
  }

  void _sync() {
    _delay?.cancel();
    if (!widget.loading) {
      _anim.stop();
      _shown = false;
      return;
    }
    _delay = Timer(const Duration(milliseconds: 200), () {
      if (!mounted) return;
      setState(() => _shown = true);
      _anim.repeat();
    });
  }

  @override
  void dispose() {
    _delay?.cancel();
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_shown) return widget.child;
    return SizedBox(
      height: widget.height,
      child: Center(
        child: SizedBox(
          height: widget.height,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(widget.height / 2),
            child: CustomPaint(
              painter: _LoadingPainter(_anim, widget.color, widget.trackColor),
              size: Size.infinite,
            ),
          ),
        ),
      ),
    );
  }
}

class _LoadingPainter extends CustomPainter {
  _LoadingPainter(this.t, this.color, this.track) : super(repaint: t);

  final Animation<double> t;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = track);
    final w = size.width * 0.35;
    final x = Curves.easeInOut.transform(t.value) * (size.width + w) - w;
    canvas.drawRect(
      Rect.fromLTWH(x, 0, w, size.height),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_LoadingPainter old) =>
      old.color != color || old.track != track;
}
