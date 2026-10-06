import { useEffect, useState, type ReactNode } from "react";
import { SubsonicApiError } from "@resonia/api-client";
import { LoginPage } from "../features/auth/LoginPage";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "../stores/serversStore";

type SessionStatus = "checking" | "valid" | "invalid";

// Codes Subsonic d'échec d'authentification (identifiants refusés, méthode d'auth non supportée,
// accès refusé) — les seuls qui justifient de renvoyer à l'écran de connexion.
const AUTH_ERROR_CODES = new Set([40, 41, 42, 43, 44, 50]);

export function SessionGate({ children }: { children: ReactNode }) {
  // Stores hydratés de façon synchrone avant le premier rendu (voir main.tsx).
  const hydrated = useServersStore((s) => s.hydrated);
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const removeServer = useServersStore((s) => s.removeServer);

  // Dérivé dès le premier rendu : un serveur enregistré affiche l'app immédiatement (le ping ne
  // fait que vérifier en arrière-plan, voir plus bas) — aucune frame « Chargement... » au lancement.
  const [status, setStatus] = useState<SessionStatus>(() =>
    !hydrated ? "checking" : servers.some((s) => s.id === activeServerId) ? "valid" : "invalid",
  );

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

  // Ne devrait plus jamais s'afficher (hydratation synchrone) : simple fond, sans texte.
  if (!hydrated || status === "checking") {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  if (status === "invalid") {
    return <LoginPage />;
  }

  return <>{children}</>;
}
