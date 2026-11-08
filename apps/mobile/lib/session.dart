import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';

/// Session Subsonic, comme le web : on garde le couple salt + token (md5(motDePasse + salt)),
/// jamais le mot de passe en clair.
class Session {
  const Session({required this.url, required this.username, required this.salt, required this.token});

  final String url;
  final String username;
  final String salt;
  final String token;

  Map<String, String> get authParams => {'u': username, 't': token, 's': salt, 'v': '1.16.1', 'c': 'Resonia', 'f': 'json'};

  Map<String, String> toJson() => {'url': url, 'username': username, 'salt': salt, 'token': token};

  static Session fromJson(Map<String, dynamic> j) =>
      Session(url: j['url'], username: j['username'], salt: j['salt'], token: j['token']);
}

/// Hôte du réseau local : IP privée / lien local / boucle locale / CGNAT (Tailscale…),
/// `localhost`, `*.local` (mDNS) ou nom sans point (« nas »).
bool isLocalHost(String host) {
  final h = host.toLowerCase();
  if (h == 'localhost' || h.endsWith('.local')) return true;
  final ip = InternetAddress.tryParse(h);
  if (ip == null) return !h.contains('.') && !h.contains(':');
  if (ip.isLoopback || ip.isLinkLocal) return true;
  final b = ip.rawAddress;
  if (ip.type == InternetAddressType.IPv4) {
    return b[0] == 10 ||
        (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
        (b[0] == 192 && b[1] == 168) ||
        (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
  }
  return (b[0] & 0xfe) == 0xfc; // IPv6 ULA fc00::/7
}

/// Accepte « music.example.com » ou « 192.168.1.2:4533 » (schéma ajouté : http en local,
/// https sinon) et retire les / finaux. http:// n'est accepté que vers le réseau local.
String normalizeServerUrl(String input) {
  var s = input.trim();
  if (s.isEmpty) throw const ApiException(ApiError.invalidUrl);
  if (!s.contains('://')) {
    final host = Uri.tryParse('http://$s')?.host ?? '';
    s = '${isLocalHost(host) ? 'http' : 'https'}://$s';
  }
  final uri = Uri.tryParse(s);
  if (uri == null || !uri.hasAuthority || uri.host.isEmpty || !(uri.isScheme('http') || uri.isScheme('https'))) {
    throw const ApiException(ApiError.invalidUrl);
  }
  if (uri.isScheme('http') && !isLocalHost(uri.host)) throw const ApiException(ApiError.insecureHttp);
  return s.replaceFirst(RegExp(r'/+$'), '');
}

String _salt() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final r = Random.secure();
  return List.generate(12, (_) => chars[r.nextInt(chars.length)]).join();
}

/// Vérifie les identifiants par un ping Subsonic et renvoie la session à enregistrer.
Future<Session> login(String serverUrl, String username, String password) async {
  final salt = _salt();
  final session = Session(
    url: normalizeServerUrl(serverUrl),
    username: username.trim(),
    salt: salt,
    token: md5.convert(utf8.encode(password + salt)).toString(),
  );
  final api = SubsonicApi(session);
  try {
    await api.ping();
    return session;
  } finally {
    api.close();
  }
}

/// Session persistée dans le Keychain (iOS) / Keystore (Android).
class SessionStore {
  SessionStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'session';
  // Lisible après le premier déverrouillage : la lecture en arrière-plan écran verrouillé en aura besoin.
  static const _ios = IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device);

  Future<Session?> load() async {
    try {
      final raw = await _storage.read(key: _key, iOptions: _ios);
      return raw == null ? null : Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null; // Entrée illisible (clé perdue après restauration) : on redemande la connexion.
    }
  }

  Future<void> save(Session s) => _storage.write(key: _key, value: jsonEncode(s.toJson()), iOptions: _ios);

  Future<void> clear() => _storage.delete(key: _key, iOptions: _ios);
}
