import { useEffect, useState, type ReactNode } from "react";
import { SubsonicApiError } from "@resonia/api-client";
import { LoginPage } from "../features/auth/LoginPage";
import { useTranslation } from "../lib/i18n";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "../stores/serversStore";
import { useSettingsStore } from "../stores/settingsStore";

type SessionStatus = "checking" | "valid" | "invalid";

// Codes Subsonic d'échec d'authentification (identifiants refusés, méthode d'auth non supportée,
// accès refusé) — les seuls qui justifient de renvoyer à l'écran de connexion.
const AUTH_ERROR_CODES = new Set([40, 41, 42, 43, 44, 50]);

export function SessionGate({ children }: { children: ReactNode }) {
  const hydrated = useServersStore((s) => s.hydrated);
  const hydrate = useServersStore((s) => s.hydrate);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const removeServer = useServersStore((s) => s.removeServer);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const { t } = useTranslation();

  const [status, setStatus] = useState<SessionStatus>("checking");

  useEffect(() => {
    hydrate();
    hydrateSettings();
  }, [hydrate, hydrateSettings]);

  // Revalide la session uniquement quand la connexion du serveur actif change (bascule,
  // identifiants modifiés) — pas pour un simple renommage ou l'ajout d'un autre serveur, qui
  // démonteraient sinon toute l'app le temps du ping.
  const activeServer = servers.find((s) => s.id === activeServerId);
  const sessionKey = activeServer
    ? `${activeServer.id}|${activeServer.url}|${activeServer.username}|${activeServer.token}`
    : null;

  useEffect(() => {
    if (!hydrated) return;

    const activeServer = useServersStore.getState().servers.find((s) => s.id === activeServerId);
    if (!activeServer) {
      setStatus("invalid");
      return;
    }

    let cancelled = false;
    // Optimiste : un serveur déjà enregistré affiche l'app tout de suite, le ping ne fait que
    // vérifier en arrière-plan. Avant, toute l'interface attendait sa réponse derrière un écran
    // de chargement — c'est la première requête de la session (poignée de main TLS comprise),
    // plus d'une seconde sur un serveur distant, à chaque ouverture de l'app.
    setStatus("valid");

    getClientForServer(activeServer)
      .ping()
      .catch(async (err: unknown) => {
        // Seuls des identifiants refusés déconnectent. Une erreur réseau (serveur injoignable,
        // Wi-Fi coupé, délai) supprimait auparavant le serveur enregistré — l'utilisateur devait
        // tout ressaisir au moindre démarrage hors ligne.
        if (!(err instanceof SubsonicApiError) || !AUTH_ERROR_CODES.has(err.code)) {
          console.warn("[session] Vérification du serveur impossible, session conservée", err);
          return;
        }
        await removeServer(activeServer.id);
        if (!cancelled) setStatus("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionKey, activeServerId, removeServer]);

  if (!hydrated || status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        {t("common.loading")}
      </div>
    );
  }

  if (status === "invalid") {
    return <LoginPage />;
  }

  return <>{children}</>;
}
