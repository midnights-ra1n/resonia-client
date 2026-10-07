import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { AlbumSummary } from "@resonia/api-client";
import { AlbumInfoModal } from "../AlbumInfoModal";
import { ContextMenu } from "./ContextMenu";
import { buildAlbumMenuItems } from "./buildAlbumMenuItems";
import { useContextMenu } from "./useContextMenu";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";

/** Menu contextuel (clic droit) d'un album, partagé par toutes les surfaces qui en affichent un
 *  (cartes des carrousels, accès rapide, bandeau d'accueil) : `onContextMenu` à poser sur
 *  l'élément, `menuElement` à rendre n'importe où dessous (menu et modale d'infos sont portés
 *  dans <body>, ou en position fixe). */
export function useAlbumContextMenu(album: AlbumSummary | undefined, coverUrl?: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const menu = useContextMenu();
  const [infoOpen, setInfoOpen] = useState(false);

  const menuElement = album ? (
    <>
      {menu.open && server && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={menu.close}
          items={buildAlbumMenuItems({
            album,
            client: getClientForServer(server),
            t,
            navigate,
            addToQueue,
            onOpenInfo: () => setInfoOpen(true),
          })}
        />
      )}

      {infoOpen &&
        createPortal(
          <AlbumInfoModal album={album} coverUrl={coverUrl} onClose={() => setInfoOpen(false)} />,
          document.body,
        )}
    </>
  ) : null;

  return { onContextMenu: menu.handleContextMenu, menuElement };
}
