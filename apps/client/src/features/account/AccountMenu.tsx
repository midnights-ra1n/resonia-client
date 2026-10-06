import { Check, CircleNotch, GearSix, PencilSimple, Plus, SignOut, Trash } from "../../components/icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { invalidateNativeToken } from "../../lib/subsonic/getNativeClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore, type StoredServer } from "../../stores/serversStore";
import { AccountAvatar } from "./AccountAvatar";
import { ServerFormModal } from "./ServerFormModal";

const itemClass =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-white/10 hover:text-white";

/** Bulle du compte (barre supérieure, à droite) : au clic, un menu liste les serveurs
 *  Navidrome enregistrés (bascule, ajout, modification, retrait), mène aux paramètres et
 *  permet de se déconnecter. */
export function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const setActiveServer = useServersStore((s) => s.setActiveServer);
  const removeServer = useServersStore((s) => s.removeServer);
  const resetPlayback = usePlayerStore((s) => s.resetPlayback);

  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [formServer, setFormServer] = useState<StoredServer | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredServer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!activeServer) return null;

  function closeMenu() {
    setOpen(false);
    setSwitchError(null);
  }

  /** Quitte le serveur actif : la file appartient à l'ancien serveur, et la page courante
   *  (album, playlist...) n'existe pas sur le nouveau. */
  function leaveActiveServer() {
    resetPlayback();
    navigate("/");
  }

  async function switchTo(server: StoredServer) {
    if (server.id === activeServerId || switchingId) return;
    setSwitchError(null);
    setSwitchingId(server.id);
    try {
      // Vérifié AVANT de basculer : un serveur injoignable ne doit ni couper la lecture en
      // cours, ni être retiré par SessionGate (qui oublie un serveur dont le ping échoue).
      await getClientForServer(server).ping();
      leaveActiveServer();
      setActiveServer(server.id);
      closeMenu();
    } catch {
      setSwitchError(t("account.switchError", { name: server.name }));
    } finally {
      setSwitchingId(null);
    }
  }

  async function forgetServer(server: StoredServer) {
    if (server.id === activeServerId) leaveActiveServer();
    invalidateNativeToken(server.id);
    await removeServer(server.id);
  }

  async function handleLogout(server: StoredServer) {
    closeMenu();
    await forgetServer(server);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menuLabel")}
        title={activeServer.username}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 shadow-e1 transition-colors hover:bg-surface-3"
      >
        <AccountAvatar server={activeServer} size={28} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-panel border border-white/5 bg-surface-2 p-2 shadow-e2 animate-pop-in"
        >
          <div className="flex items-center gap-3 px-3 pt-2 pb-3">
            <AccountAvatar server={activeServer} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{activeServer.username}</p>
              <p className="truncate text-xs text-neutral-400">{activeServer.name}</p>
            </div>
          </div>

          <div className="border-t border-white/5 pt-2">
            <h3 className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
              {t("account.servers")}
            </h3>
            {servers.map((server) => {
              const isActive = server.id === activeServerId;
              return (
                <div key={server.id} className="group relative">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => switchTo(server)}
                    title={isActive ? undefined : t("account.switchTo", { name: server.name })}
                    className={`${itemClass} pr-[68px]`}
                  >
                    <AccountAvatar server={server} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{server.name}</span>
                      <span className="block truncate text-xs text-neutral-500">{server.username}</span>
                    </span>
                  </button>
                  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5">
                    {switchingId === server.id ? (
                      <CircleNotch size={16} className="animate-spin text-neutral-400" />
                    ) : (
                      <>
                        {/* Actions révélées au survol / focus clavier, la coche reste visible sinon. */}
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            setFormServer(server);
                          }}
                          title={t("account.editServer")}
                          aria-label={t("account.editServer")}
                          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          <PencilSimple size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            setDeleteTarget(server);
                          }}
                          title={t("account.deleteServer")}
                          aria-label={t("account.deleteServer")}
                          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          <Trash size={16} />
                        </button>
                        {isActive && (
                          <Check
                            size={18}
                            className="absolute right-1.5 text-accent transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {switchError && <p className="px-3 py-1 text-xs text-red-400">{switchError}</p>}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                setFormServer("new");
              }}
              className={itemClass}
            >
              <Plus size={18} className="text-neutral-400" />
              {t("account.addServer")}
            </button>
          </div>

          <div className="mt-2 border-t border-white/5 pt-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                navigate("/settings");
              }}
              className={itemClass}
            >
              <GearSix size={18} className="text-neutral-400" />
              {t("nav.settings")}
            </button>
            <button type="button" role="menuitem" onClick={() => handleLogout(activeServer)} className={itemClass}>
              <SignOut size={18} className="text-neutral-400" />
              {t("account.logout")}
            </button>
          </div>
        </div>
      )}

      {/* Modales portées dans <body> : le panneau de contenu est un contexte d'empilement isolé,
          elles passeraient sinon sous le lecteur flottant. */}
      {formServer &&
        createPortal(
          <ServerFormModal
            server={formServer === "new" ? undefined : formServer}
            onClose={() => setFormServer(null)}
            onAdded={() => {
              leaveActiveServer();
              closeMenu();
            }}
          />,
          document.body,
        )}

      {deleteTarget &&
        createPortal(
          <ConfirmDeleteModal
            title={t("account.deleteServer")}
            message={t("account.deleteConfirm", { name: deleteTarget.name })}
            confirmLabel={t("account.delete")}
            onConfirm={async () => {
              await forgetServer(deleteTarget);
              setDeleteTarget(null);
            }}
            onCancel={() => setDeleteTarget(null)}
          />,
          document.body,
        )}
    </div>
  );
}
