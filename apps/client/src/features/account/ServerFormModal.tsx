import { X } from "../../components/icons";
import { useState, type FormEvent } from "react";
import { useTranslation } from "../../lib/i18n";
import { authenticateServer } from "../../lib/subsonic/authenticateServer";
import { invalidateNativeToken } from "../../lib/subsonic/getNativeClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { pickAvatarColor, useServersStore, type StoredServer } from "../../stores/serversStore";

interface ServerFormModalProps {
  /** Serveur à modifier ; absent = ajout d'un nouveau serveur. */
  server?: StoredServer;
  onClose: () => void;
  /** Appelé après un ajout réussi, avec le serveur créé (à activer par l'appelant). */
  onAdded?: (server: StoredServer) => void;
}

export function ServerFormModal({ server, onClose, onAdded }: ServerFormModalProps) {
  const { t } = useTranslation();
  const addServer = useServersStore((s) => s.addServer);
  const updateServer = useServersStore((s) => s.updateServer);
  const isActive = useServersStore((s) => s.activeServerId === server?.id);
  const resetPlayback = usePlayerStore((s) => s.resetPlayback);
  const isEdit = Boolean(server);

  const [name, setName] = useState(server?.name ?? "");
  const [serverUrl, setServerUrl] = useState(server?.url ?? "");
  const [username, setUsername] = useState(server?.username ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // En modification, le mot de passe n'est redemandé que si l'adresse ou l'utilisateur change :
  // le jeton enregistré n'est valable que pour le couple d'origine.
  const credentialsChanged = !server || serverUrl !== server.url || username !== server.username;
  const passwordRequired = credentialsChanged;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Porté dans <body> depuis la barre supérieure : sans cela, l'événement React remonterait
    // jusqu'au formulaire de recherche parent.
    e.stopPropagation();
    setError(null);
    setSubmitting(true);

    try {
      const displayName = name.trim() || new URL(serverUrl).hostname;

      if (!server) {
        const session = await authenticateServer(serverUrl, username, password);
        const created: StoredServer = {
          id: crypto.randomUUID(),
          name: displayName,
          ...session,
          avatarColor: pickAvatarColor(),
          createdAt: Date.now(),
        };
        // `addServer` active aussitôt le nouveau serveur : on laisse l'appelant le faire
        // (arrêt de la lecture en cours) avant de l'enregistrer.
        onAdded?.(created);
        await addServer(created);
      } else if (password || credentialsChanged) {
        const session = await authenticateServer(serverUrl, username, password);
        invalidateNativeToken(server.id);
        // Les URL de flux en file portent les anciens identifiants.
        if (isActive) resetPlayback();
        await updateServer(server.id, { name: displayName, ...session });
      } else {
        await updateServer(server.id, { name: displayName });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.genericError"));
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-full bg-neutral-800 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-panel border border-white/5 bg-surface-2 p-6 shadow-e2 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{isEdit ? t("account.editServer") : t("account.addServer")}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("account.form.name")}</label>
            <input
              type="text"
              value={name}
              placeholder={t("account.form.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("auth.login.serverUrl")}</label>
            <input
              type="url"
              required
              placeholder={t("auth.login.serverUrlPlaceholder")}
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("auth.login.username")}</label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("auth.login.password")}</label>
            <input
              type="password"
              required={passwordRequired}
              autoComplete={isEdit ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {isEdit && (
              <p className="text-xs text-neutral-500">
                {passwordRequired ? t("account.form.passwordRequired") : t("account.form.passwordKeep")}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-accent py-2.5 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting
              ? isEdit
                ? t("account.form.saving")
                : t("account.form.adding")
              : isEdit
                ? t("common.save")
                : t("account.form.add")}
          </button>
        </form>
      </div>
    </div>
  );
}
