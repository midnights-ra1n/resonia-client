# Resonia — Vue d'ensemble

Client musical Spotify-like pour serveurs Navidrome et OpenSubsonic. Multi-plateforme :
Desktop (Windows/Linux/macOS), Web (Docker), Mobile (Android/iOS).

## Stack

| Cible | Stack |
|---|---|
| Desktop | React + TypeScript + Vite + Tailwind CSS v4 + Tauri v2 |
| Web (+ Docker) | React + TypeScript + Vite + Tailwind CSS v4 |
| Mobile | Dart + Flutter (repo/app séparée, hors de ce monorepo) |
| API commune | TypeScript |

Desktop et Web partagent le même code React (`apps/client`). Tauri se greffe dessus
sans dupliquer l'UI (`src-tauri/` à côté du frontend Vite, même `dist/` de build).

## Fonctionnalités prévues (certaines déjà construites, d'autres à venir)

- Authentification Subsonic ✅
- Gestion multi-serveurs/instances ✅
- Page d'accueil façon Spotify (albums les plus joués ✅, titres les plus joués ✅,
  playlists en cours d'intégration dans la sidebar)
- Page de paramètres (à construire)
- Tableau de statistiques d'écoutes avec export PNG/JSON/CSV (à construire)
- Mise en cache performante ✅ (Cache Storage API + LRU)
- Téléchargement de musiques pour écoute hors-ligne (à construire)
- **Connect** (façon Spotify Connect, contrôle pair-à-pair via mDNS sur le réseau
  local, activé par défaut mais désactivable) : **repo GitHub séparé**, développé
  en tout dernier, ne pas y toucher dans ce repo.

## Monorepo
apps/client/ # App React unique (web + desktop via Tauri)
packages/api-client/ # Client Subsonic/OpenSubsonic en TS (@resonia/api-client)
packages/core/ # Code métier partagé (peu rempli pour l'instant)
packages/ui/ # Design system partagé (peu rempli pour l'instant)
packages/config-*/ # Configs partagées (eslint, tsconfig, tailwind)
docker/ # Déploiement web
Gestion via **pnpm workspaces + Turborepo**. `packageManager` dans le `package.json`
racine doit être un semver **exact** (pas de `^`/`~`), sinon pnpm refuse de démarrer.

## Conventions

- Commits : **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`...)
- Branches : `feature/<nom>`, `fix/<nom>`, `chore/<nom>`, depuis `development`
- Repo GitHub **public**, licence **GPL-3.0**
- Police **Roboto en fichiers locaux** (`public/fonts/roboto/*.woff2`), jamais via CDN
  externe (Google Fonts interdit)
- Toute nouvelle dépendance doit être justifiée par rapport à l'objectif de légèreté
  du projet — préférer une solution maison quand c'est raisonnable (voir i18n dans
  `02-architecture.md` comme exemple de ce principe appliqué)

## Important — origine du code

Ce projet est développé **à partir de zéro** avec assistance IA (Claude + agents locaux
via Cline). **Ne jamais copier, s'inspirer structurellement de, ou réutiliser du code
provenant d'autres clients Navidrome existants** (Feishin, etc.) sans demande explicite
du mainteneur. Un incident passé (copie non voulue du README/de la structure de Feishin
par un autre agent IA) a eu lieu et doit rester un cas isolé — toujours vérifier
l'originalité du code généré avant de le committer.
