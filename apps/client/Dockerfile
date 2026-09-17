# Image Docker pour la version web de Resonia uniquement (pas de téléchargement hors-ligne, pas
# de transcodage configurable : la qualité audio web est forcée en AAC 256 kbps, cf.
# src/lib/audio/qualityOptions.ts). Les clients de bureau (Tauri) sont distribués via les
# workflows release-stable.yml / release-beta.yml, pas via cette image.
#
# Contexte de build attendu : la racine du monorepo (nécessaire pour pnpm-lock.yaml et les
# packages du workspace @resonia/*).
#   docker build -f apps/client/Dockerfile -t resonia-client-web .

# --platform=$BUILDPLATFORM force ce stage à toujours tourner nativement sur l'architecture du
# runner qui builde, jamais sous émulation QEMU — même quand la build finale cible plusieurs
# architectures (linux/amd64,linux/arm64 côté buildx). Le résultat (assets Vite statiques : HTML/
# JS/CSS) est indépendant de l'architecture, donc un seul build natif suffit pour toutes les
# cibles ci-dessous. Sans ce pin, buildx exécute ce stage une fois PAR plateforme cible et émule
# celles qui ne sont pas natives — observé en pratique : Node/V8 plante sous QEMU pendant
# `pnpm install` ("qemu: uncaught target signal 4 (Illegal instruction)").
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY apps/client/package.json apps/client/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @resonia/client build

FROM nginx:1.29-alpine AS runtime

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html

EXPOSE 80
