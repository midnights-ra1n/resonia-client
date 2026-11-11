import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'app_scope.dart';
import 'home_page.dart';
import 'icons.dart';
import 'l10n/app_localizations.dart';
import 'login_page.dart';
import 'player/player.dart';
import 'player/player_ui.dart';
import 'session.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Pochettes décodées gardées en RAM : 40 Mo suffisent à l'accueil + une page album.
  PaintingBinding.instance.imageCache.maximumSizeBytes = 40 << 20;
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
  await PlayerController.initBackground();
  // Lu avant le premier rendu (l'écran de lancement reste affiché) : pas de flash de la page de connexion.
  final store = SessionStore();
  runApp(
    ResoniaApp(
      store: store,
      initialSession: await store.load(),
      player: PlayerController(),
    ),
  );
}

class ResoniaApp extends StatefulWidget {
  const ResoniaApp({
    super.key,
    required this.store,
    required this.player,
    this.initialSession,
  });

  final SessionStore store;
  final PlayerController player;
  final Session? initialSession;

  @override
  State<ResoniaApp> createState() => _ResoniaAppState();
}

class _ResoniaAppState extends State<ResoniaApp> {
  SubsonicApi? _api;

  @override
  void initState() {
    super.initState();
    final s = widget.initialSession;
    if (s != null) _start(s);
  }

  /// Ouvre la session : API + lecteur (cache du serveur, reprise de la file sauvegardée).
  void _start(Session s) {
    _api = SubsonicApi(s);
    unawaited(widget.player.attach(_api!));
  }

  Future<void> _onLoggedIn(Session s) async {
    await widget.store.save(s);
    setState(() => _start(s));
  }

  Future<void> _logout() async {
    await widget.player.detach();
    await widget.store.clear();
    _api?.close();
    setState(() => _api = null);
  }

  @override
  Widget build(BuildContext context) {
    final api = _api;
    return MaterialApp(
      title: 'Resonia',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      // Au-dessus du navigateur racine : le lecteur plein écran y a aussi accès.
      builder: (context, child) => api == null
          ? child!
          : AppScope(api: api, player: widget.player, child: child!),
      home: api == null
          ? LoginPage(onLoggedIn: _onLoggedIn)
          : AppShell(session: api.session, onLogout: _logout),
    );
  }
}

/// Coquille façon Spotify mobile : onglets en bas (une pile de navigation par onglet), mini-
/// lecteur au-dessus, contenu qui défile sous la barre en dégradé.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.session, required this.onLogout});

  final Session session;
  final VoidCallback onLogout;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tab = 0;
  final _navigators = List.generate(3, (_) => GlobalKey<NavigatorState>());

  void _select(int i) {
    // Toucher l'onglet déjà actif revient à sa racine, comme Spotify.
    if (i == _tab) {
      _navigators[i].currentState?.popUntil((r) => r.isFirst);
    } else {
      setState(() => _tab = i);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final titles = [l.navHome, l.navSearch, l.navLibrary];
    final avatar = _AccountButton(
      session: widget.session,
      onLogout: widget.onLogout,
    );
    final roots = <Widget>[
      HomePage(api: AppScope.read(context).api, leading: avatar),
      _Page(
        title: titles[1],
        leading: avatar,
        child: _SearchField(hint: l.searchPlaceholder),
      ),
      _Page(title: titles[2], leading: avatar),
    ];
    // Retour système (Android) : d'abord dans la pile de l'onglet.
    return NavigatorPopHandler(
      onPopWithResult: (_) => _navigators[_tab].currentState?.maybePop(),
      child: Scaffold(
        extendBody: true,
        // IndexedStack garde l'état (défilement, saisie, pages ouvertes) de chaque onglet.
        body: IndexedStack(
          index: _tab,
          children: [
            for (final (i, root) in roots.indexed)
              Navigator(
                key: _navigators[i],
                onGenerateRoute: (_) =>
                    MaterialPageRoute<void>(builder: (_) => root),
              ),
          ],
        ),
        bottomNavigationBar: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x00000000),
                Color(0xE6000000),
                AppColors.bgSunken,
              ],
              stops: [0, 0.45, 1],
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const MiniPlayer(),
              BottomNavigationBar(
                currentIndex: _tab,
                onTap: _select,
                type: BottomNavigationBarType.fixed,
                backgroundColor: Colors.transparent,
                elevation: 0,
                selectedItemColor: AppColors.text1,
                unselectedItemColor: AppColors.text2,
                selectedFontSize: 11,
                unselectedFontSize: 11,
                // Même glyphe Material Symbols, plein (FILL 1) quand l'onglet est actif.
                items: [
                  for (final (i, icon) in [
                    AppIcons.home,
                    AppIcons.search,
                    AppIcons.libraryMusic,
                  ].indexed)
                    BottomNavigationBarItem(
                      icon: Icon(icon, fill: 0),
                      activeIcon: Icon(icon, fill: 1),
                      label: titles[i],
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pastille du compte en haut à gauche, comme Spotify : ouvre le menu du compte.
class _AccountButton extends StatelessWidget {
  const _AccountButton({required this.session, required this.onLogout});

  final Session session;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: l.accountMenu,
      excludeSemantics:
          true, // l'initiale seule ne veut rien dire pour un lecteur d'écran
      child: GestureDetector(
        onTap: () => showModalBottomSheet<void>(
          context: context,
          backgroundColor: AppColors.surface2,
          showDragHandle: true,
          builder: (ctx) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: _Initial(session.username),
                  title: Text(session.username),
                  subtitle: Text(
                    Uri.parse(session.url).host,
                    style: const TextStyle(color: AppColors.text2),
                  ),
                ),
                ListTile(
                  leading: const Icon(AppIcons.logout, color: AppColors.text1),
                  title: Text(l.accountLogout),
                  onTap: () {
                    Navigator.pop(ctx);
                    onLogout();
                  },
                ),
              ],
            ),
          ),
        ),
        child: _Initial(session.username),
      ),
    );
  }
}

class _Initial extends StatelessWidget {
  const _Initial(this.name);
  final String name;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 16,
      backgroundColor: AppColors.accent,
      foregroundColor: AppColors.onAccent,
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({required this.title, required this.leading, this.child});
  final String title;
  final Widget leading;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      // Dégradé haut de page, comme l'en-tête de l'accueil web.
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.center,
          colors: [AppColors.surface3, AppColors.bgBase],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 200),
          children: [
            Row(
              children: [
                leading,
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ),
              ],
            ),
            if (child != null) ...[const SizedBox(height: 16), child!],
          ],
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.hint});
  final String hint;

  @override
  Widget build(BuildContext context) {
    return TextField(
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.text3),
        prefixIcon: const Icon(AppIcons.search, color: AppColors.text2),
        filled: true,
        fillColor: AppColors.surface2,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}
