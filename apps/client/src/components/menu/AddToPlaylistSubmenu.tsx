import { Check, CircleNotch, Plus } from "../icons";
import { useEffect, useState } from "react";
import type { SubsonicClient } from "@resonia/api-client";
import { usePlaylists } from "../../hooks/usePlaylists";
import { useTranslation } from "../../lib/i18n";
import { emitPlaylistSongsChanged } from "../../lib/playlists/playlistEvents";

interface AddToPlaylistSubmenuProps {
  client: SubsonicClient;
  /** Résolu une seule fois à l'ouverture du menu (pas au survol) : pour un album, ceci
   *  implique un fetch de la liste complète des titres — nécessaire de toute façon pour
   *  déterminer l'appartenance aux playlists ci-dessous. */
  getSongIds: () => Promise<string[]>;
}

export function AddToPlaylistSubmenu({ client, getSongIds }: AddToPlaylistSubmenuProps) {
  const { t } = useTranslation();
  const { playlists, loading } = usePlaylists();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Résolu une seule fois à l'ouverture (pas à chaque clic) : réutilisé à la fois pour la
  // vérification d'appartenance ci-dessous et pour les ajouts déclenchés par les cases à
  // cocher, pour ne pas re-fetcher (ex: titres d'un album) à chaque interaction.
  const [songIds, setSongIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSongIds().then((ids) => {
      if (!cancelled) setSongIds(ids);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cocher/décocher une playlist déclenche immédiatement l'ajout/le retrait du(des)
  // titre(s) (pas de bouton de validation à part) : `pendingIds` suit les requêtes en vol
  // par playlist (pour désactiver seulement cette ligne, pas tout le menu, et permettre de
  // cocher/décocher plusieurs playlists coup sur coup sans attendre la réponse de la
  // précédente). `addedIds` reflète les playlists qui contiennent déjà le(s) titre(s) —
  // préchargé via `getPlaylist` ci-dessous, puis tenu à jour au fil des ajouts/retraits
  // confirmés côté serveur pendant cette session du menu.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Le menu affichait toutes les cases décochées même quand le titre était déjà dans la
  // playlist (aucune vérification n'était faite, seul l'historique local de la session du
  // menu comptait) : on interroge ici le contenu de chaque playlist pour précocher celles
  // qui contiennent déjà TOUS les titres concernés. Coût : un `getPlaylist` par playlist à
  // l'ouverture — acceptable vu le nombre de playlists généralement affiché dans ce menu.
  useEffect(() => {
    if (songIds === null || playlists.length === 0) return;
    let cancelled = false;

    Promise.all(
      playlists.map((playlist) =>
        client
          .getPlaylist(playlist.id)
          .then((full) => {
            const memberIds = new Set(full.entry.map((song) => song.id));
            return songIds.every((id) => memberIds.has(id)) ? playlist.id : null;
          })
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setAddedIds((prev) => {
        const next = new Set(prev);
        results.forEach((id) => {
          if (id) next.add(id);
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songIds, playlists]);

  async function toggle(playlistId: string) {
    if (songIds === null || pendingIds.has(playlistId)) return;
    const wasAdded = addedIds.has(playlistId);
    setError(null);
    setPendingIds((prev) => new Set(prev).add(playlistId));
    try {
      if (wasAdded) {
        await client.removeSongsFromPlaylist(playlistId, songIds);
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(playlistId);
          return next;
        });
      } else {
        await client.addSongsToPlaylist(playlistId, songIds);
        setAddedIds((prev) => new Set(prev).add(playlistId));
      }
      emitPlaylistSongsChanged(playlistId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("contextMenu.addToPlaylistError"));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || songIds === null) return;

    setCreatingBusy(true);
    setError(null);
    try {
      const playlist = await client.createPlaylist(trimmed);
      await client.addSongsToPlaylist(playlist.id, songIds);
      setAddedIds((prev) => new Set(prev).add(playlist.id));
      setCreating(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("contextMenu.addToPlaylistError"));
    } finally {
      setCreatingBusy(false);
    }
  }

  return (
    <div className="max-h-96 w-64 overflow-y-auto py-1">
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
            disabled={creatingBusy || !newName.trim()}
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
            const pending = pendingIds.has(playlist.id);
            return (
              <button
                key={playlist.id}
                type="button"
                disabled={pending || songIds === null}
                onClick={() => toggle(playlist.id)}
                className="flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    added ? "border-emerald-500 bg-emerald-500 text-black" : "border-neutral-500"
                  }`}
                >
                  {pending ? (
                    <CircleNotch size={11} className="animate-spin text-neutral-400" />
                  ) : (
                    added && <Check size={11} strokeWidth={3} />
                  )}
                </span>
                <span className="flex-1 truncate">{playlist.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
