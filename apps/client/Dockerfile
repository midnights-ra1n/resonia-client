# Image Docker pour la version web de Resonia uniquement (pas de téléchargement hors-ligne, pas
# de transcodage configurable : la qualité audio web est forcée en AAC 256 kbps, cf.
# src/lib/audio/qualityOptions.ts). Les clients de bureau (Tauri) sont distribués via les
# workflows release-stable.yml / release-beta.yml, pas via cette image.
#
# Contexte de build attendu : la racine du monorepo (nécessaire pour pnpm-lock.yaml et les
# packages du workspace @resonia/*).
#   docker build -f apps/client/Dockerfile -t resonia-client-web .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
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
