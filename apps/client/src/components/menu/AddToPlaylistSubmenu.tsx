import { Check, Plus } from "lucide-react";
import { useState } from "react";
import type { SubsonicClient } from "@resonia/api-client";
import { usePlaylists } from "../../hooks/usePlaylists";
import { useTranslation } from "../../lib/i18n";

interface AddToPlaylistSubmenuProps {
  client: SubsonicClient;
  /** Résolu au moment de l'ajout (pas au survol) : pour un album, ceci implique un fetch
   *  de la liste complète des titres. */
  getSongIds: () => Promise<string[]>;
  close: () => void;
  /** Si true, le menu reste ouvert après un ajout (chaque playlist cliquée se coche) —
   *  permet d'ajouter à plusieurs playlists d'affilée sans rouvrir le menu. */
  stayOpen?: boolean;
}

export function AddToPlaylistSubmenu({ client, getSongIds, close, stayOpen }: AddToPlaylistSubmenuProps) {
  const { t } = useTranslation();
  const { playlists, loading } = usePlaylists();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Suivi purement local des playlists auxquelles on a ajouté pendant cette session du
  // menu (pas l'appartenance réelle côté serveur, qu'on ne récupère pas ici) — juste pour
  // donner un retour visuel immédiat quand le menu reste ouvert.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  async function handleAdd(playlistId: string) {
    setBusy(true);
    setError(null);
    try {
      const songIds = await getSongIds();
      await client.addSongsToPlaylist(playlistId, songIds);
      if (stayOpen) {
        setAddedIds((prev) => new Set(prev).add(playlistId));
        setBusy(false);
      } else {
        close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("contextMenu.addToPlaylistError"));
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      const playlist = await client.createPlaylist(trimmed);
      const songIds = await getSongIds();
      await client.addSongsToPlaylist(playlist.id, songIds);
      if (stayOpen) {
        setAddedIds((prev) => new Set(prev).add(playlist.id));
        setCreating(false);
        setNewName("");
        setBusy(false);
      } else {
        close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("contextMenu.addToPlaylistError"));
      setBusy(false);
    }
  }

  return (
    <div className="max-h-72 w-64 overflow-y-auto py-1">
      {creating ? (
        <form onSubmit={handleCreate} className="px-2.5 py-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("playlists.nameLabel")}
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="mt-2 w-full rounded-md bg-emerald-500 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {t("playlists.create")}
          </button>
        </form>
      ) : (
        <div className="px-1.5">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white"
          >
            <Plus size={16} className="shrink-0 text-neutral-400" />
            {t("contextMenu.newPlaylist")}
          </button>
        </div>
      )}

      <div className="mx-1.5 my-1 h-px bg-white/10" />

      {loading ? (
        <p className="px-3 py-2 text-sm text-neutral-500">{t("contextMenu.loadingPlaylists")}</p>
      ) : playlists.length === 0 ? (
        <p className="px-3 py-2 text-sm text-neutral-500">{t("contextMenu.noPlaylists")}</p>
      ) : (
        <div className="px-1.5">
          {playlists.map((playlist) => {
            const added = addedIds.has(playlist.id);
            return (
              <button
                key={playlist.id}
                type="button"
                disabled={busy}
                onClick={() => handleAdd(playlist.id)}
                className="flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white disabled:opacity-50"
              >
                <span className="flex-1 truncate">{playlist.name}</span>
                {added && <Check size={14} className="shrink-0 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
