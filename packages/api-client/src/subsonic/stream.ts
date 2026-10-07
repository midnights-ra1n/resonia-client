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
    // Ne JAMAIS demander `estimateContentLength` : Navidrome annonce alors un Content-Length
    // estimé (durée × débit nominal), et le serveur HTTP Go refuse d'écrire au-delà de la taille
    // déclarée. Dès que le transcodage réel dépasse l'estimation (débit effectif un peu au-dessus
    // du nominal, en-têtes du conteneur), la fin de la piste est silencieusement coupée — la
    // lecture s'arrêtait quelques secondes avant la fin, et le fichier tronqué était mis en cache
    // comme complet.
  }
  if (options.timeOffset && options.timeOffset > 0) {
    params.set("timeOffset", String(Math.floor(options.timeOffset)));
  }
  if (options.maxBitRate && options.maxBitRate > 0) {
    params.set("maxBitRate", String(options.maxBitRate));
  }

  return `${ctx.baseUrl}/rest/stream?${params.toString()}`;
}
