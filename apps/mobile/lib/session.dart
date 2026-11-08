import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

enum LoginError { invalidUrl, unreachable, notNavidrome, badCredentials, unknown }

class LoginException implements Exception {
  const LoginException(this.error);
  final LoginError error;
}

/// Accepte « music.example.com » (https ajouté) ; retire les / finaux. null si invalide.
String? normalizeServerUrl(String input) {
  var s = input.trim();
  if (s.isEmpty) return null;
  if (!s.contains('://')) s = 'https://$s';
  final uri = Uri.tryParse(s);
  if (uri == null || !uri.hasAuthority || uri.host.isEmpty || !(uri.isScheme('http') || uri.isScheme('https'))) {
    return null;
  }
  return s.replaceFirst(RegExp(r'/+$'), '');
}

String _salt() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final r = Random.secure();
  return List.generate(12, (_) => chars[r.nextInt(chars.length)]).join();
}

/// Vérifie les identifiants par un ping Subsonic et renvoie la session à enregistrer.
Future<Session> login(String serverUrl, String username, String password, {HttpClient? client}) async {
  final url = normalizeServerUrl(serverUrl);
  if (url == null) throw const LoginException(LoginError.invalidUrl);
  final salt = _salt();
  final session = Session(
    url: url,
    username: username.trim(),
    salt: salt,
    token: md5.convert(utf8.encode(password + salt)).toString(),
  );

  final http = client ?? HttpClient();
  http.connectionTimeout = const Duration(seconds: 10);
  try {
    final uri = Uri.parse('$url/rest/ping').replace(queryParameters: session.authParams);
    final res = await (await http.getUrl(uri)).close().timeout(const Duration(seconds: 15));
    final body = await res.transform(utf8.decoder).join();
    final Map<String, dynamic> sub;
    try {
      sub = (jsonDecode(body) as Map<String, dynamic>)['subsonic-response'] as Map<String, dynamic>;
    } catch (_) {
      throw const LoginException(LoginError.notNavidrome);
    }
    if (sub['status'] == 'ok') return session;
    // 40 : identifiants faux ; 41 : auth par token refusée (compte LDAP, etc.).
    final code = (sub['error'] as Map?)?['code'];
    throw LoginException(code == 40 || code == 41 ? LoginError.badCredentials : LoginError.unknown);
  } on LoginException {
    rethrow;
  } on SocketException {
    throw const LoginException(LoginError.unreachable);
  } on HandshakeException {
    throw const LoginException(LoginError.unreachable);
  } on TimeoutException {
    throw const LoginException(LoginError.unreachable);
  } on HttpException {
    throw const LoginException(LoginError.unreachable);
  } finally {
    if (client == null) http.close();
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
