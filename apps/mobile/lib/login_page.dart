import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'l10n/app_localizations.dart';
import 'session.dart';
import 'theme.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLoggedIn});

  final Future<void> Function(Session) onLoggedIn;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _url = TextEditingController();
  final _user = TextEditingController();
  final _pass = TextEditingController();
  ApiError? _error;
  bool _loading = false;

  @override
  void dispose() {
    _url.dispose();
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading || _url.text.trim().isEmpty || _user.text.trim().isEmpty || _pass.text.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.onLoggedIn(await login(_url.text, _user.text, _pass.text));
      TextInput.finishAutofillContext(); // propose d'enregistrer dans le trousseau / gestionnaire
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.error);
    } catch (_) {
      if (mounted) setState(() => _error = ApiError.unknown);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(AppLocalizations l, ApiError e) => switch (e) {
    ApiError.invalidUrl => l.loginErrorInvalidUrl,
    ApiError.insecureHttp => l.loginErrorInsecureHttp,
    ApiError.unreachable => l.loginErrorUnreachable,
    ApiError.notNavidrome => l.loginErrorNotNavidrome,
    ApiError.badCredentials => l.loginErrorCredentials,
    ApiError.unknown => l.loginErrorGeneric,
  };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: AppColors.bgBase,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(child: Image.asset('assets/logo_full.png', height: 40, semanticLabel: 'Resonia')),
                    const SizedBox(height: 40),
                    Text(l.loginTitle, textAlign: TextAlign.center, style: text.headlineMedium),
                    const SizedBox(height: 28),
                    _Field(
                      label: l.loginServerUrl,
                      controller: _url,
                      hint: l.loginServerUrlPlaceholder,
                      keyboardType: TextInputType.url,
                      autofillHints: const [AutofillHints.url],
                    ),
                    _Field(
                      label: l.loginUsername,
                      controller: _user,
                      autofillHints: const [AutofillHints.username],
                    ),
                    _Field(
                      label: l.loginPassword,
                      controller: _pass,
                      obscure: true,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        // liveRegion : le lecteur d'écran annonce l'erreur dès qu'elle apparaît.
                        child: Semantics(
                          liveRegion: true,
                          child: Text(_message(l, _error!), style: text.bodyMedium?.copyWith(color: AppColors.danger)),
                        ),
                      ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accent,
                        foregroundColor: AppColors.onAccent,
                        disabledBackgroundColor: AppColors.accent.withValues(alpha: 0.5),
                        disabledForegroundColor: AppColors.onAccent,
                        minimumSize: const Size.fromHeight(50),
                        shape: const StadiumBorder(),
                        textStyle: text.titleMedium,
                      ),
                      child: Text(_loading ? l.loginSubmitting : l.loginSubmit),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.obscure = false,
    this.autofillHints,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final bool obscure;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final pill = OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(label, style: const TextStyle(color: AppColors.text2, fontSize: 14)),
          ),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: obscure,
            autocorrect: false,
            enableSuggestions: false,
            textCapitalization: TextCapitalization.none,
            autofillHints: autofillHints,
            textInputAction: onSubmitted == null ? TextInputAction.next : TextInputAction.go,
            onSubmitted: onSubmitted,
            cursorColor: AppColors.accent,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: AppColors.text3),
              filled: true,
              fillColor: AppColors.surface3,
              contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              border: pill,
              enabledBorder: pill,
              focusedBorder: pill.copyWith(borderSide: const BorderSide(color: AppColors.accent, width: 2)),
            ),
          ),
        ],
      ),
    );
  }
}
