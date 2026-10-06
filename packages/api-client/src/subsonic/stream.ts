export interface StreamUrlOptions {
  format?: "aac" | "mp3" | "opus" | "raw";
  maxBitRate?: number;
  /** Secondes entières : le serveur démarre le TRANSCODAGE à cette position (`-ss` d'ffmpeg). Seul
   *  moyen de se positionner dans un flux transcodé, qui n'accepte pas les requêtes par plage. */
  timeOffset?: number;
}

export interface StreamUrlContext {
  baseUrl: string;
  username: string;
  token: string;
  salt: string;
  clientName: string;
  apiVersion: string;
}

export function buildStreamUrl(
  ctx: StreamUrlContext,
  trackId: string,
  options: StreamUrlOptions = {},
): string {
  const params = new URLSearchParams({
    u: ctx.username,
    t: ctx.token,
    s: ctx.salt,
    v: ctx.apiVersion,
    c: ctx.clientName,
    id: trackId,
  });

  if (options.format && options.format !== "raw") {
    params.set("format", options.format);
    // Sans taille annoncée, un flux transcodé à la volée arrive sans Content-Length : les
    // navigateurs le traitent comme un direct (durée infinie, aucun préchargement — Chromium
    // n'y garde que ~2 s d'avance, la moindre irrégularité réseau coupe la lecture). Le serveur
    // annonce ici une taille ESTIMÉE (durée × débit) : le flux redevient un fichier ordinaire
    // pour le lecteur, téléchargé d'avance. Taille approximative : voir rangeFetcher pour
    // l'usage qui en est fait côté cache.
    // Pas avec `timeOffset` : la taille estimée resterait celle du morceau entier alors que le
    // flux s'arrête plus tôt — le lecteur y verrait un téléchargement tronqué (erreur réseau).
    if (!options.timeOffset) params.set("estimateContentLength", "true");
  }
  if (options.timeOffset && options.timeOffset > 0) {
    params.set("timeOffset", String(Math.floor(options.timeOffset)));
  }
  if (options.maxBitRate && options.maxBitRate > 0) {
    params.set("maxBitRate", String(options.maxBitRate));
  }

  return `${ctx.baseUrl}/rest/stream?${params.toString()}`;
}
