Resonia est un client pour Navidrome qui sera très Spotify like. Il sera écrit en TypeScript, Vite et devra être compatible sur navigateur web et bureau. Les clients de bureau différont du web.

Le moteur doit garantir :

- lecture gapless ;
- préchargement des 3 prochaines pistes ;
- absence de coupure entre deux pistes ;
- aucune interruption du morceau courant lors du preload ;
- cache des données audio réutilisable ;
- transition contrôlée par l'audio engine et non par l'UI.

Lors d'une modification du moteur audio, préserver ces invariants.

L'interface graphique elle devra être très ressemblante à Spotify mais en gardant quand même quelque chose d'unique pour nous.

L'application doit être absolument optimisé de fond en combles pour Safari (WebKit et WebKitGTK) et WebView2. Ainsi que pour un Chromium Embed Framework.
L'application devra être la plus optimisée et rapide possible. Le moins de consommation CPU, RAM, GPU et sur ordinateur portable le moins de consommation de batterie, je veux l'app la plus discrète.