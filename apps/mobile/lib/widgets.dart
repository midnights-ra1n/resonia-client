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
      var r = 0, g = 0, b = 0;
      final n = px.lengthInBytes ~/ 4;
      for (var i = 0; i < px.lengthInBytes; i += 4) {
        r += px.getUint8(i);
        g += px.getUint8(i + 1);
        b += px.getUint8(i + 2);
      }
      return Color.fromARGB(255, r ~/ n, g ~/ n, b ~/ n);
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
