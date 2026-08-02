# Architecture technique détaillée

## Référence API Subsonic / OpenSubsonic

- Doc officielle Subsonic (API historique, base de Navidrome) :
  http://www.subsonic.org/pages/api.jsp
- Doc OpenSubsonic (extensions modernes, notamment utilisées par Navidrome) :
  https://opensubsonic.netlify.app/
- Doc Navidrome elle-même (comportement spécifique, endpoints supportés) :
  https://www.navidrome.org/docs/developers/subsonic-api/

### Rappels essentiels déjà validés dans ce projet

- Toutes les requêtes REST passent par `/rest/<endpoint>` avec les paramètres d'auth
  systématiques : `u` (username), `t` (token), `s` (salt), `v` (version API, on utilise
  `1.16.1`), `c` (nom du client, `"Resonia"`), `f=json` (format de réponse)
- Auth par token dérivé : `t = md5(password + s)`, jamais le mot de passe en clair
- Réponse toujours enveloppée dans `{ "subsonic-response": { status, ... } }`,
  `status: "failed"` accompagné d'un `error: { code, message }`
- Endpoints déjà implémentés dans `packages/api-client/src/subsonic/client.ts` :
  `ping`, `getAlbumList2`, `getAlbum`, `search3`, `getCoverArtUrl`, `getStreamUrl`
  (construit via `stream.ts` / `buildStreamUrl`), `scrobble`
- `getAlbumList2` accepte `type`: `frequent` (les plus joués), `recent`, `newest`,
  `random`, `highest` — utilisé actuellement avec `frequent` pour la home
- Pas d'endpoint natif "titres les plus joués" au niveau global — contournement actuel :
  `search3("")` sur 500 résultats + tri client par `playCount` (voir
  `useMostPlayedSongs.ts`)
- Le streaming (`/rest/stream`) accepte `format` (`aac`/`mp3`/`opus`, omis = pas de
  transcodage = fichier original) et `maxBitRate` (omis ou 0 = pas de limite)
- Avant d'ajouter un nouvel endpoint, vérifier s'il existe déjà dans `client.ts` avant
  de le redéfinir ailleurs

## Authentification & multi-serveurs

- Auth Subsonic classique : `token = md5(password + salt)`. Le mot de passe **n'est
  jamais stocké**, seuls `salt` et `token` le sont.
- `packages/api-client/src/subsonic/auth.ts` — génération salt/token
- `packages/api-client/src/subsonic/client.ts` — classe `SubsonicClient`, méthodes :
  `ping`, `getAlbumList2`, `getAlbum`, `search3`, `getCoverArtUrl`, `getStreamUrl`,
  `scrobble`
- Multi-serveurs : `apps/client/src/stores/serversStore.ts` (Zustand), persistance via
  `apps/client/src/lib/storage` (interface `StorageAdapter`, implémentation actuelle
  `localStorageAdapter` — un adapter Tauri viendra plus tard **sans changer l'interface
  consommée par le reste du code**)
- `apps/client/src/app/SessionGate.tsx` — vérifie la session au démarrage (hydrate le
  store puis affiche soit l'app, soit `LoginPage`)

## i18n — solution maison, zéro dépendance

`apps/client/src/lib/i18n/` :
- `locales/en.json`, `locales/fr.json` — JSON imbriqué par langue
- `resolvePath.ts` — résolution de clé par chemin (`t("auth.login.title")`) +
  interpolation `{{var}}`, repli automatique sur l'anglais si une clé manque
- `I18nContext.tsx` / `useTranslation.ts` — Provider + hook React
- Ajouter une langue = un fichier JSON + une ligne dans `translations.ts`, rien d'autre
- **Ne jamais installer i18next** — décision consciente, gardée pour la légèreté

## Routing

React Router (`apps/client/src/app/router.tsx`). `AppLayout` (Sidebar + `Outlet`).
**Toujours** `Link`/`NavLink` de `react-router-dom` pour la navigation interne, **jamais**
`<a href>` (casse le routing SPA, force un rechargement complet de la page).

## Sidebar & Playlists

`apps/client/src/app/layout/Sidebar.tsx` — navigation principale + section playlists
dynamique en bas (`usePlaylists` hook, sur le modèle de `useMostPlayedAlbums`/
`useMostPlayedSongs` : fetch Subsonic + état `loading`/`error`, skeleton pendant le
chargement).

## Page d'accueil

`apps/client/src/features/home/` :
- `useMostPlayedAlbums.ts` — `getAlbumList2(type: "frequent")`
- `useMostPlayedSongs.ts` — `search3("")` sur 500 résultats, tri client par `playCount`
  (l'API Subsonic n'a pas d'endpoint natif "top titres global")
- `AlbumCard.tsx` — grille d'albums, bouton play au survol (`getAlbum` puis
  `playTrack(premier titre, tracklist complète)`)
- `SongRow.tsx` — liste de titres façon Spotify (index → bouton play au survol,
  toggle play/pause si c'est déjà le titre en cours)

## Moteur audio — `apps/client/src/lib/audio/`

**Fichier principal : `instantGaplessEngine.ts`**, piloté depuis `stores/playerStore.ts`.
C'est la pièce la plus retravaillée du projet — lire `03-known-gotchas.md` avant d'y toucher.

Architecture à **deux modes cohabitant dans un seul `AudioContext`** :

1. **Mode natif** (`<audio>` connecté via `createMediaElementSource`) : démarrage
   **instantané** au clic utilisateur — streaming HTTP progressif, aucune attente de
   téléchargement complet. Utilisé pour le titre que l'utilisateur vient de sélectionner.
2. **Mode buffer** (`AudioBufferSourceNode`) : utilisé pour le **titre suivant de la
   queue**. Décodé intégralement en arrière-plan (`loadTrackArrayBuffer` +
   `decodeAudioData`) pendant que le titre actuel joue, silence de bord rogné
   (`trimSilence.ts` → `detectEdgeSilence`), puis planifié sample-accurate sur
   l'horloge de l'`AudioContext` (`scheduleNext`) pour un enchaînement gapless.

Le titre en cours (mode natif) reçoit aussi, en parallèle et en arrière-plan, un
décodage complet (`refinePreciseTrim`) pour connaître sa **durée logique exacte**
(padding exclu) — géré par un `decodeToken` qui invalide un résultat devenu obsolète
si l'utilisateur change de titre entre-temps.

**Cache** (`audioCache.ts`, Cache Storage API + métadonnées LRU dans `storage`) :
- `getCachedTrackUrl(trackId, qualityId)` → Object URL si déjà en cache (mode natif)
- `loadTrackArrayBuffer(trackId, qualityId, streamUrl)` → ArrayBuffer, cache ou réseau
  (mode buffer / décodage)
- Plafond 500 Mo par défaut (`DEFAULT_MAX_BYTES`), éviction LRU automatique

**Media Session API** (`mediaSession.ts`) — Now Playing OS (macOS Control Center/Touch
Bar, notifications média Windows/Linux) + touches média clavier (play/pause/next/prev/seek).

**Scrobbling Subsonic** (`client.scrobble()`) déclenché automatiquement depuis le store :
now-playing après 1s de lecture, submission après 50% du morceau (plafonné à 240s).

## Qualité audio

`apps/client/src/lib/audio/qualityOptions.ts` — catalogue filtré par plateforme :
- `getPlatform()` (dans `lib/platform/`) détecte Tauri via `window.__TAURI_INTERNALS__`
- **Web** : AAC 256 kbps uniquement
- **Desktop** : AAC 256 + Opus 192 + MP3 320 + Lossless (`format=raw`, pas de transcode)

Préférence persistée dans `stores/settingsStore.ts`, avec garde-fou : si la qualité
stockée n'est plus disponible sur la plateforme courante (ex: profil "Lossless" ouvert
un jour sur le web), repli automatique sur AAC 256 plutôt que de planter.

## Streaming — construction d'URL

`packages/api-client/src/subsonic/stream.ts` (`buildStreamUrl`) + méthode
`SubsonicClient.getStreamUrl(trackId, { format, maxBitRate })`.

