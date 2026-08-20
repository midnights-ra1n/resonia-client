import { useEffect, useState, type ReactNode } from "react";
import { LoginPage } from "../features/auth/LoginPage";
import { useTranslation } from "../lib/i18n";
import { getClientForServer } from "../lib/subsonic/getClientForServer";
import { useServersStore } from "../stores/serversStore";
import { useSettingsStore } from "../stores/settingsStore";

type SessionStatus = "checking" | "valid" | "invalid";

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

  useEffect(() => {
    if (!hydrated) return;

    const activeServer = servers.find((s) => s.id === activeServerId);
    if (!activeServer) {
      setStatus("invalid");
      return;
    }

    let cancelled = false;
    setStatus("checking");

    getClientForServer(activeServer)
      .ping()
      .then(() => {
        if (!cancelled) setStatus("valid");
      })
      .catch(async () => {
        // Invalid token/expired or unreachable server: remove this server.
        await removeServer(activeServer.id);
        if (!cancelled) setStatus("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, servers, activeServerId, removeServer]);

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
