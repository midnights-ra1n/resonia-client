Resonia est un client pour Navidrome qui sera très Spotify like. Il sera écrit en TypeScript, Vite et devra être compatible sur navigateur web et bureau. Les clients de bureau différont du web, ils sont compilés avec Tauri (Rust) pour garder une base légère et optimisée.

Le moteur doit garantir :

- lecture gapless ;
- préchargement des 3 prochaines pistes ;
- absence de coupure entre deux pistes ;
- aucune interruption du morceau courant lors du preload ;
- cache des données audio réutilisable ;
- transition contrôlée par l'audio engine et non par l'UI.

Lors d'une modification du moteur audio, préserver ces invariants.

L'interface graphique elle devra être très ressemblante à Spotify mais en gardant quand même quelque chose d'unique pour nous.
