import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import type { PlaylistSummary } from "@resonia/api-client";
import { useTranslation } from "../../lib/i18n";
import { uploadPlaylistArtwork } from "../../lib/navidrome/nativeApi";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useServersStore } from "../../stores/serversStore";

interface CreatePlaylistModalProps {
  onClose: () => void;
  onCreated?: (playlist: PlaylistSummary) => void;
}

export function CreatePlaylistModal({ onClose, onCreated }: CreatePlaylistModalProps) {
  const { t } = useTranslation();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const server = servers.find((s) => s.id === activeServerId);
    if (!server) return;

    setSubmitting(true);
    setError(null);

    try {
      const client = getClientForServer(server);
      const created = await client.createPlaylist(name.trim());

      if (description.trim()) {
        await client.updatePlaylist(created.id, { comment: description.trim() });
      }

      if (photoFile) {
        try {
          await uploadPlaylistArtwork(server, created.id, photoFile);
        } catch (photoErr) {
          console.warn("[playlists] Playlist créée, mais l'upload de la pochette a échoué", photoErr);
        }
      }

      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("playlists.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t("playlists.createTitle")}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 transition hover:bg-neutral-700"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={28} className="text-neutral-500" />
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("playlists.nameLabel")}</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-400">{t("playlists.descriptionLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-full bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? t("playlists.creating") : t("playlists.create")}
          </button>
        </form>
      </div>
    </div>
  );
}
