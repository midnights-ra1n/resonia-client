import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'home_page.dart';
import 'icons.dart';
import 'l10n/app_localizations.dart';
import 'login_page.dart';
import 'session.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
  // Lu avant le premier rendu (l'écran de lancement reste affiché) : pas de flash de la page de connexion.
  final store = SessionStore();
  runApp(ResoniaApp(store: store, initialSession: await store.load()));
}

class ResoniaApp extends StatefulWidget {
  const ResoniaApp({super.key, required this.store, this.initialSession});

  final SessionStore store;
  final Session? initialSession;

  @override
  State<ResoniaApp> createState() => _ResoniaAppState();
}

class _ResoniaAppState extends State<ResoniaApp> {
  late Session? _session = widget.initialSession;

  Future<void> _onLoggedIn(Session s) async {
    await widget.store.save(s);
    setState(() => _session = s);
  }

  Future<void> _logout() async {
    await widget.store.clear();
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    return MaterialApp(
      title: 'Resonia',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: session == null
          ? LoginPage(onLoggedIn: _onLoggedIn)
          : AppShell(session: session, onLogout: _logout),
    );
  }
}

/// Coquille façon Spotify mobile : onglets en bas, contenu qui défile sous la barre en dégradé.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.session, required this.onLogout});

  final Session session;
  final VoidCallback onLogout;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tab = 0;
  late final _api = SubsonicApi(widget.session);

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final titles = [l.navHome, l.navSearch, l.navLibrary];
    final avatar = _AccountButton(session: widget.session, onLogout: widget.onLogout);
    return Scaffold(
      extendBody: true,
      // IndexedStack garde l'état (défilement, saisie) de chaque onglet.
      body: IndexedStack(
        index: _tab,
        children: [
          HomePage(api: _api, leading: avatar),
          _Page(title: titles[1], leading: avatar, child: _SearchField(hint: l.searchPlaceholder)),
          _Page(title: titles[2], leading: avatar),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x00000000), Color(0xE6000000), AppColors.bgSunken],
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _tab,
          onTap: (i) => setState(() => _tab = i),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: AppColors.text1,
          unselectedItemColor: AppColors.text2,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          // Même glyphe Material Symbols, plein (FILL 1) quand l'onglet est actif.
          items: [
            for (final (i, icon) in [AppIcons.home, AppIcons.search, AppIcons.libraryMusic].indexed)
              BottomNavigationBarItem(icon: Icon(icon, fill: 0), activeIcon: Icon(icon, fill: 1), label: titles[i]),
          ],
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
      excludeSemantics: true, // l'initiale seule ne veut rien dire pour un lecteur d'écran
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
                  subtitle: Text(Uri.parse(session.url).host, style: const TextStyle(color: AppColors.text2)),
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
      child: Text(name.isEmpty ? '?' : name.characters.first.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
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
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            Row(
              children: [
                leading,
                const SizedBox(width: 12),
                Expanded(child: Text(title, style: Theme.of(context).textTheme.headlineMedium)),
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
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
      ),
    );
  }
}
