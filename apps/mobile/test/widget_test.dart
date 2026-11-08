import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:resonia/login_page.dart';
import 'package:resonia/main.dart';
import 'package:resonia/session.dart';

const session = Session(url: 'https://m.example.com', username: 'noe', salt: 'abc', token: 'def');

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('shows the login page without a saved session', (tester) async {
    await tester.pumpWidget(ResoniaApp(store: SessionStore()));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.byType(AppShell), findsNothing);
  });

  testWidgets('saved session opens the shell; logout clears it', (tester) async {
    final store = SessionStore();
    await store.save(session);
    await tester.pumpWidget(ResoniaApp(store: store, initialSession: session));
    await tester.pumpAndSettle();
    expect(find.byType(AppShell), findsOneWidget);

    // Onglets
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);

    // Déconnexion depuis la pastille du compte
    await tester.tap(find.byType(CircleAvatar).hitTestable().first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Log out'));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
    expect(await store.load(), isNull);
  });
}
