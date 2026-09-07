import { Check, ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { AddToPlaylistSubmenu } from "../../components/menu/AddToPlaylistSubmenu";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useServersStore } from "../../stores/serversStore";
import type { Track } from "../../stores/playerStore";

interface LikeButtonProps {
  track: Track;
}

export function LikeButton({ track }: LikeButtonProps) {
  const { t } = useTranslation();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const isLiked = useFavoritesStore((s) => s.likedIds.has(track.id));
  const like = useFavoritesStore((s) => s.like);
  const unlike = useFavoritesStore((s) => s.unlike);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!isLiked) {
      like(track.id);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 6 });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={isLiked ? t("favorites.unlike") : t("favorites.addToLiked")}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          isLiked
            ? "border-emerald-500 bg-emerald-500 text-black hover:scale-105"
            : "border-neutral-500 text-neutral-400 hover:border-white hover:text-white"
        }`}
      >
        {isLiked ? <Check size={11} strokeWidth={3} /> : <Plus size={11} strokeWidth={3} />}
      </button>

      {menu && client && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              type: "submenu",
              label: t("contextMenu.addToPlaylist"),
              icon: ListMusic,
              renderSubmenu: (close) => (
                <AddToPlaylistSubmenu
                  client={client}
                  getSongIds={async () => [track.id]}
                  close={close}
                  stayOpen
                />
              ),
            },
            { type: "separator" },
            {
              type: "action",
              label: t("favorites.unlike"),
              icon: Check,
              onClick: () => unlike(track.id),
            },
          ]}
        />
      )}
    </>
  );
}
