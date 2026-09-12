import { Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InfoModal } from "../../components/InfoModal";
import { ContextMenu, type MenuItem } from "../../components/menu/ContextMenu";
import { buildTrackMenuItems } from "../../components/menu/buildTrackMenuItems";
import { useContextMenu } from "../../components/menu/useContextMenu";
import { MarqueeText } from "../../components/MarqueeText";
import { formatTrackDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { downloadStore } from "../../lib/downloads/downloadStore";
import type { DownloadedTrackMeta } from "../../lib/downloads/types";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { DownloadProgressRow, type PendingDownloadItem } from "./DownloadProgressRow";

export function DownloadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const servers = useServersStore((s) => s.servers);
  const activeServerId = useServersStore((s) => s.activeServerId);
  const server = servers.find((s) => s.id === activeServerId);
  const client = server ? getClientForServer(server) : null;

  const [downloaded, setDownloaded] = useState<DownloadedTrackMeta[]>([]);
  const [pending, setPending] = useState<PendingDownloadItem[]>(() => downloadStore.getPendingItems());
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const rowMenu = useContextMenu();
  const [activeMetaKey, setActiveMetaKey] = useState<string | null>(null);
  const [rowInfoOpen, setRowInfoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      downloadStore.listDownloaded().then((list) => {
        if (!cancelled) setDownloaded(list);
      });
    };
    refresh();
    const unsubSize = downloadStore.onSizeChange(refresh);
    const unsubQueue = downloadStore.onQueueChange(() => {
      setPending(downloadStore.getPendingItems());
      refresh();
    });
    return () => {
      cancelled = true;
      unsubSize();
      unsubQueue();
    };
  }, []);

  const queue = downloaded.map((d) => d.track);
  const activeMeta = downloaded.find((d) => d.key === activeMetaKey) ?? null;

  function handleTrackDoubleClick(meta: DownloadedTrackMeta) {
    if (currentTrack?.id === meta.trackId) {
      togglePlay();
      return;
    }
    playTrack(meta.track, queue);
  }

  function buildRowMenuItems(meta: DownloadedTrackMeta): MenuItem[] {
    const items = client
      ? buildTrackMenuItems({
          track: meta.track,
          client,
          t,
          navigate,
          addToQueue,
          onOpenInfo: () => {
            setActiveMetaKey(meta.key);
            setRowInfoOpen(true);
          },
        })
      : [];
    items.push({
      type: "action",
      label: t("contextMenu.removeDownload"),
      icon: Trash2,
      danger: true,
      onClick: () => downloadStore.removeDownload(meta.trackId, meta.qualityId),
    });
    return items;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-black text-white">{t("downloads.title")}</h1>

      {pending.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">{t("downloads.queuedSection")}</h2>
          {pending.map((item) => (
            <DownloadProgressRow key={item.key} item={item} />
          ))}
        </div>
      )}

      <div className="mt-8">
        {downloaded.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-white">{t("downloads.emptyTitle")}</p>
            <p className="mt-1 text-sm text-neutral-400">{t("downloads.emptySubtitle")}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[32px_1fr_1fr_72px] gap-3 border-b border-neutral-800 px-2 pb-2 text-xs uppercase tracking-wider text-neutral-500">
              <span className="text-center">#</span>
              <span>{t("downloads.columnTitle")}</span>
              <span>{t("downloads.columnAlbum")}</span>
              <span className="text-right">{t("downloads.columnDuration")}</span>
            </div>

            {downloaded.map((meta, index) => {
              const isCurrent = currentTrack?.id === meta.trackId;
              return (
                <div
                  key={meta.key}
                  onDoubleClick={() => handleTrackDoubleClick(meta)}
                  onContextMenu={(e) => {
                    setActiveMetaKey(meta.key);
                    rowMenu.handleContextMenu(e);
                  }}
                  className="group grid cursor-pointer select-none grid-cols-[32px_1fr_1fr_72px] items-center gap-3 rounded-md px-2 py-3 hover:bg-neutral-800/60"
                >
                  <div className="flex items-center justify-center text-sm text-neutral-400">
                    {isCurrent && isPlaying ? (
                      <Pause size={14} className="text-emerald-400" fill="currentColor" />
                    ) : (
                      <>
                        <span className="group-hover:hidden">{index + 1}</span>
                        <Play size={14} className="hidden text-white group-hover:block" fill="currentColor" />
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <MarqueeText text={meta.track.title} className={`text-sm ${isCurrent ? "text-emerald-400" : "text-white"}`} />
                    <MarqueeText text={meta.track.artist} className="text-xs text-neutral-400" />
                  </div>
                  <div className="min-w-0 truncate text-xs text-neutral-400">{meta.track.album}</div>
                  <span className="text-right text-xs text-neutral-400 tabular-nums">{formatTrackDuration(meta.track.duration)}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {rowMenu.open && activeMeta && <ContextMenu x={rowMenu.x} y={rowMenu.y} onClose={rowMenu.close} items={buildRowMenuItems(activeMeta)} />}

      {rowInfoOpen && activeMeta && (
        <InfoModal
          title={activeMeta.track.title}
          coverUrl={activeMeta.track.coverUrl}
          onClose={() => setRowInfoOpen(false)}
          rows={[
            { label: t("search.artistLabel"), value: activeMeta.track.artist },
            { label: t("album.labelAlbum"), value: activeMeta.track.album },
            { label: t("downloads.columnDuration"), value: formatTrackDuration(activeMeta.track.duration) },
          ]}
        />
      )}
    </div>
  );
}
