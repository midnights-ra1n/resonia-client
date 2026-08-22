import { X } from "lucide-react";
import { useState } from "react";
import type { SubsonicClient } from "@resonia/api-client";
import { useTranslation } from "../../lib/i18n";

interface RenamePlaylistModalProps {
  playlistId: string;
  currentName: string;
  client: SubsonicClient;
  onClose: () => void;
  onRenamed: (name: string) => void;
}

export function RenamePlaylistModal({ playlistId, currentName, client, onClose, onRenamed }: RenamePlaylistModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      await client.updatePlaylist(playlistId, { name: trimmed });
      onRenamed(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("playlists.renameError"));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t("playlists.renameTitle")}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-full bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? t("playlists.renaming") : t("common.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
