import { Check, Playlist, Plus } from "../../components/icons";
import { useState } from "react";
import { ContextMenu } from "../../components/menu/ContextMenu";
import { AddToPlaylistSubmenu } from "../../components/menu/AddToPlaylistSubmenu";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useServersStore } from "../../stores/serversStore";
import type { Track } from "../../stores/playerStore";

interface LikeButtonProps {
  track: Pick<Track, "id">;
  /** Ligne de liste : « + » visible au survol, « ✓ » toujours visible ; les clics ne remontent pas à la ligne. */
  row?: boolean;
}

export function LikeButton({ track, row }: LikeButtonProps) {
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

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const Wrap = row ? "span" : "div";
  return (
    <Wrap
      className={row ? "shrink-0" : "contents"}
      onClick={row ? stop : undefined}
      onDoubleClick={row ? stop : undefined}
      onContextMenu={row ? stop : undefined}
    >
      <button
        type="button"
        onClick={handleClick}
        title={isLiked ? t("favorites.unlike") : t("favorites.addToLiked")}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          isLiked
            ? "border-accent bg-accent text-on-accent hover:scale-105"
            : "border-neutral-500 text-neutral-400 hover:border-white hover:text-white"
        } ${row && !isLiked ? "opacity-0 focus-visible:opacity-100 group-hover:opacity-100" : ""}`}
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
              icon: Playlist,
              renderSubmenu: () => (
                <AddToPlaylistSubmenu client={client} getSongIds={async () => [track.id]} />
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
    </Wrap>
  );
}
