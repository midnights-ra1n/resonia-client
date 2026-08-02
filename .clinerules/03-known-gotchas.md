# Pièges déjà rencontrés — lire avant de toucher aux zones concernées

Cette liste vient de bugs réels rencontrés et corrigés en développement. Un agent qui
retravaille le moteur audio, le cache, ou l'auth DOIT lire ce fichier en premier.

## Moteur audio — le plus piégeux du projet

- **Ne jamais réintroduire de logique de reconnexion réseau automatique** dans le
  player (retry sur `offline`/`online`, timers de reconnexion, `visibilitychange` qui
  relance le stream). Explicitement supprimée à la demande du mainteneur — source de
  bugs (saut de lecture en arrière au retour d'onglet/veille).

- **`audio.crossOrigin = "anonymous"` est obligatoire** sur tout `<audio>` connecté à
  un `AudioContext` via `createMediaElementSource`. Sans ça : silence total en sortie
  (mesure de sécurité du navigateur), même si le flux "semble" jouer (`readyState=4`,
  événement `playing` déclenché). Navidrome envoie `Access-Control-Allow-Origin: *`
  par défaut — si le son ne sort pas malgré ça, vérifier CET attribut avant de
  suspecter le serveur/reverse proxy.

- **Le padding silencieux introduit par le transcodage AAC (ffmpeg côté Navidrome) est
  indétectable via métadonnées côté navigateur.** Le `skip_samples` que lit un lecteur
  natif (MPV, utilisé par Feishin desktop) n'est exposé par **aucune API JS**
  (`decodeAudioData`, `<audio>`). D'où l'approche par seuil d'amplitude
  (`trimSilence.ts` → `detectEdgeSilence`), qui est une **approximation**, pas un
  rognage exact. C'est un plafond technique du navigateur, pas un bug à "corriger"
  indéfiniment — ne pas relancer de cycle d'itérations dessus sans nouvelle piste
  concrète.

- **Le vrai gapless byte-perfect n'est possible que via un lecteur natif (MPV)** —
  décision actée : ce sera fait **uniquement pour le client desktop Tauri**, pas encore
  implémenté (chantier futur, sidecar process MPV piloté par Tauri). Ne pas essayer de
  reproduire un gapless parfait côté web au-delà de l'heuristique déjà en place.

- **Le basculement d'état lors d'une transition gapless doit être déclenché par un
  événement audio natif** (`onended` d'une `AudioBufferSourceNode`, ou un buffer
  silencieux minuté sur l'horloge de l'`AudioContext` — voir `nextTrigger` dans
  `instantGaplessEngine.ts`), **jamais par un simple `setTimeout` JS**. Les navigateurs
  throttlent fortement les timers en arrière-plan (onglet non actif), ce qui causait un
  décalage/saut de lecture au retour sur l'onglet.

- **La lecture doit démarrer instantanément au clic utilisateur** (mode natif
  `<audio>`, streaming progressif), **jamais attendre un téléchargement + décodage
  complet** avant de jouer le moindre son. Le décodage complet (mode buffer) est
  réservé au titre suivant de la queue, préchargé en arrière-plan avec plusieurs
  secondes d'avance (`PRELOAD_LEAD_SECONDS`). Mélanger les deux (tout décoder avant de
  jouer, y compris le premier clic) a déjà causé une régression de performance connue
  (~5s d'attente avant le son).

- **HMR de Vite et moteur audio ne font pas bon ménage.** Toujours faire un
  **rechargement complet de la page (F5)**, jamais compter sur le Hot Module Reload,
  après une modification de `instantGaplessEngine.ts` ou `playerStore.ts` avant de
  tester — le HMR peut laisser un ancien `AudioContext` ou d'anciens écouteurs
  d'événements actifs en parallèle des nouveaux, causant des bugs fantômes qui
  n'existent pas en usage réel (rejouer une commande dans la console peut alors donner
  un son absent, ou deux pistes qui jouent en même temps).

## Cache

- Cache Storage API (`caches.open`) avec des clés **synthétiques**
  (`https://resonia.local/audio-cache/<trackId>:<qualityId>`), ce ne sont pas de
  vraies requêtes réseau interceptées.
- Métadonnées LRU (taille, dernier accès) stockées **séparément** via `storage`
  (`resonia:audioCache:meta`), pas dans le Cache Storage lui-même.
- Plafond 500 Mo codé en dur (`DEFAULT_MAX_BYTES` dans `audioCache.ts`). **Pas encore
  réglable dans les Paramètres — TODO connu**, ne pas le considérer comme un oubli à
  corriger sans qu'on le demande explicitement.

## Navigation / UI générale

- **Ne jamais utiliser `<a href>` pour la navigation interne** — casse le routing SPA
  (rechargement complet de page). Toujours `Link`/`NavLink` de `react-router-dom`.
- En JSX, une fonction fléchée passée à `className` sur un composant type `NavLink`
  doit bien refermer son accolade (`className={({isActive}) => \`...\`}`) — un oubli
  de fermeture a déjà cassé la compilation de tout un fichier en cascade sans erreur
  évidente à l'endroit du bug lui-même.
- Ne jamais avoir deux éléments avec `mt-auto` dans le même conteneur flex si
  l'intention est que seul le premier pousse le reste vers le bas — ils se disputent
  l'espace de façon imprévisible.

## Documentation

- La documentation formelle (`docs/`, `CONTRIBUTING.md`, ADR...) a été **mise en pause
  volontairement** par le mainteneur pour se concentrer sur le développement — elle
  sera traitée dans une discussion séparée. Ne pas générer de fichiers de doc formelle
  de sa propre initiative.
