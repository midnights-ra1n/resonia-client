import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { DirectoryChildDTO } from "@resonia/api-client";
import { CaretLeft, CaretRight, Folder, Pause, Play } from "../../components/icons";
import { CoverImage } from "../../components/CoverImage";
import { LoadMore } from "../../components/LoadMore";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCoverArt } from "../../hooks/useCoverArt";
import { useInViewport } from "../../hooks/useInViewport";
import { useTrackListSelection } from "../../hooks/useTrackListSelection";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { isTypingTarget } from "../../lib/dom/isTypingTarget";
import { useTranslation } from "../../lib/i18n";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { usePlayerStore, type Track } from "../../stores/playerStore";
import { useServersStore } from "../../stores/serversStore";
import { TrackResultRow } from "../search/TrackResultRow";

// L'arborescence ne change qu'au scan de la bibliothèque.
const FOLDERS_STALE_MS = 60 * 60_000;
// Tuiles montées par tranche : la racine peut compter des milliers de dossiers (un par artiste).
const RENDER_BATCH = 200;
const NO_ENTRIES: DirectoryChildDTO[] = [];

interface Crumb {
  to: string;
  name: string;
}

// Fil d'Ariane de chaque dossier ouvert depuis l'app, mémorisé au clic : l'API ne donne que
// l'id du parent, et remonter l'arborescence coûterait une requête par niveau (racine comprise,
// qui liste toute la bibliothèque). Sans fil connu (lien direct, rechargement), un lien « … »
// vers le parent le remplace.
const trails = new Map<string, Crumb[]>();

export function FoldersPage() {
  const { id } = useParams<{ id: string }>();
  // Remontage à chaque dossier : filtre, sélection et nombre de tuiles affichées repartent de zéro.
  return <FolderView key={id ?? "root"} id={id} />;
}

function FolderView({ id }: { id: string | undefined }) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const client = server ? getClientForServer(server) : null;

  const libraries = useCachedQuery(
    server ? `${server.id}:musicFolders` : null,
    () => client!.getMusicFolders(),
    FOLDERS_STALE_MS,
  );
  const libraryId = searchParams.get("library") ?? libraries.data?.[0]?.id;
  const root = useCachedQuery(
    server && !id && libraryId ? `${server.id}:indexes:${libraryId}` : null,
    () => client!.getIndexes(libraryId!),
    FOLDERS_STALE_MS,
  );
  const dir = useCachedQuery(server && id ? `${server.id}:dir:${id}` : null, () => client!.getMusicDirectory(id!));

  const entries = (id ? dir.data?.child : root.data) ?? NO_ENTRIES;
  const name = id ? (dir.data?.name ?? "") : t("nav.folders");
  const rootCrumb: Crumb = { to: "/folders", name: t("nav.folders") };
  const crumbs: Crumb[] = !id
    ? []
    : (trails.get(id) ??
      [rootCrumb, ...(dir.data?.parent ? [{ to: `/folders/${dir.data.parent}`, name: "…" }] : [])]);
  const upTarget = crumbs.at(-1)?.to;

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const [limit, setLimit] = useState(RENDER_BATCH);
  const { folders, files } = useMemo(() => {
    const matches = deferredQuery
      ? entries.filter((e) => (e.title ?? "").toLocaleLowerCase(locale).includes(deferredQuery))
      : entries;
    return { folders: matches.filter((e) => e.isDir), files: matches.filter((e) => !e.isDir) };
  }, [entries, deferredQuery, locale]);

  const trackSelection = useTrackListSelection(files.length);
  const selectedSongIds = Array.from(trackSelection.selectedIndices)
    .map((i) => files[i]?.id)
    .filter((songId): songId is string => songId !== undefined);

  const playFromStart = usePlayerStore((s) => s.playFromStart);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);

  // Retour arrière ou Alt+↑ : dossier parent, comme dans un explorateur de fichiers.
  useEffect(() => {
    if (!upTarget) return;
    function handleKeyDown(e: KeyboardEvent) {
      const isUp = (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) || (e.altKey && e.key === "ArrowUp");
      if (!isUp || isTypingTarget(e.target)) return;
      e.preventDefault();
      navigate(upTarget!);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [upTarget, navigate]);

  if (libraries.loading || root.loading || dir.loading) return <PageSkeleton />;
  if (id && !dir.data) return <div className="p-8 text-neutral-400">{t("folders.notFound")}</div>;

  const currentCrumb: Crumb = { to: `${location.pathname}${location.search}`, name };
  const isFolderPlaying = isPlaying && currentTrackId !== undefined && files.some((f) => f.id === currentTrackId);

  function toTrack(song: DirectoryChildDTO): Track {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      artistId: song.artistId,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      suffix: song.suffix,
      bitRate: song.bitRate,
      coverUrl: client && song.coverArt ? client.getCoverArtUrl(song.coverArt, 300) : undefined,
      coverArtId: song.coverArt,
    };
  }

  function handlePlay() {
    if (isFolderPlaying) togglePlay();
    else if (files.length > 0) playFromStart(files.map(toTrack));
  }

  return (
    <div className="px-8 pb-12 pt-10">
      <nav aria-label={t("folders.breadcrumb")} className="mb-3 flex min-w-0 flex-wrap items-center gap-1 text-sm text-neutral-400">
        {upTarget && (
          <Link
            to={upTarget}
            title={t("folders.up")}
            aria-label={t("folders.up")}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-neutral-300 shadow-e1 transition-colors hover:bg-surface-3 hover:text-white"
          >
            <CaretLeft size={18} />
          </Link>
        )}
        {crumbs.map((crumb) => (
          <span key={crumb.to} className="flex min-w-0 items-center gap-1">
            <Link to={crumb.to} className="max-w-[16rem] truncate hover:text-white hover:underline">
              {crumb.name}
            </Link>
            <CaretRight size={14} className="shrink-0 text-neutral-600" />
          </span>
        ))}
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-5">
          {files.length > 0 && (
            <button
              onClick={handlePlay}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent shadow-play transition hover:scale-105 hover:bg-accent-hover"
              title={t("folders.playFiles")}
            >
              {isFolderPlaying ? (
                <Pause size={22} fill="currentColor" className="text-on-accent" />
              ) : (
                <Play size={22} fill="currentColor" className="ml-1 text-on-accent" />
              )}
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-5xl font-black text-white">{name}</h1>
            <p className="mt-3 text-sm text-neutral-400">
              {[
                folders.length > 0 && t("folders.folderCount", { count: folders.length }),
                files.length > 0 && t("folders.fileCount", { count: files.length }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(RENDER_BATCH);
            trackSelection.clearSelection();
          }}
          placeholder={t("folders.filterPlaceholder")}
          aria-label={t("folders.filterPlaceholder")}
          className="w-64 rounded-full bg-surface-2 px-4 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-white/30"
        />
      </div>

      {!id && (libraries.data?.length ?? 0) > 1 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={t("folders.libraries")}>
          {libraries.data!.map((library) => (
            <button
              key={library.id}
              onClick={() => setSearchParams({ library: library.id })}
              aria-pressed={library.id === libraryId}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                library.id === libraryId ? "bg-white text-black" : "bg-surface-2 text-white hover:bg-surface-3"
              }`}
            >
              {library.name}
            </button>
          ))}
        </div>
      )}

      {folders.length === 0 && files.length === 0 && (
        <p className="text-neutral-400">{t(entries.length === 0 ? "folders.empty" : "search.noResults")}</p>
      )}

      {(folders.length > 0 || files.length > 0) && (
        // Vue liste façon explorateur : dossiers puis fichiers, colonnes alignées sur TrackResultRow.
        <div className="mb-2 flex items-center gap-3 border-b border-neutral-800 px-3 pb-2 text-xs uppercase tracking-wider text-neutral-500">
          <span className="w-10 shrink-0" />
          <span className="flex-1">{t("folders.columnName")}</span>
          {files.length > 0 && <span className="hidden w-1/4 md:block">{t("playlist.columnAlbum")}</span>}
          {files.length > 0 && <span className="shrink-0 text-right">{t("playlist.columnDuration")}</span>}
        </div>
      )}

      {folders.length > 0 && (
        <div className="flex flex-col gap-1">
          {folders.slice(0, limit).map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              showAlbum={files.length > 0}
              onOpen={() => trails.set(folder.id, [...crumbs, currentCrumb])}
            />
          ))}
          {limit < folders.length && <LoadMore key={limit} onVisible={() => setLimit(limit + RENDER_BATCH)} />}
        </div>
      )}

      {files.length > 0 && (
        <section className={folders.length > 0 ? "mt-1" : undefined}>
          <div
            ref={trackSelection.containerRef}
            tabIndex={0}
            onKeyDown={trackSelection.handleKeyDown}
            className="flex flex-col gap-1 outline-none"
          >
            {files.map((file, index) => (
              <TrackResultRow
                key={file.id}
                song={file}
                songs={files}
                index={index}
                isSelected={trackSelection.isSelected(index)}
                onSelectClick={trackSelection.handleRowClick}
                onEnsureSelected={trackSelection.ensureSelected}
                registerRow={trackSelection.registerRow}
                selectedSongIds={selectedSongIds}
                showAlbum
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FolderRow({ folder, showAlbum, onOpen }: { folder: DirectoryChildDTO; showAlbum: boolean; onOpen: () => void }) {
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));
  const coverUrl = server && folder.coverArt ? getClientForServer(server).getCoverArtUrl(folder.coverArt, 80) : undefined;
  const [coverRef, coverInView] = useInViewport<HTMLDivElement>();
  const cachedCoverUrl = useCoverArt(server?.id, folder.coverArt, 80, coverUrl, coverInView);

  return (
    <Link
      to={`/folders/${folder.id}`}
      onClick={onOpen}
      className="track-row-cv flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-neutral-800/80 focus-visible:bg-neutral-800/80 focus-visible:outline-none"
    >
      <div ref={coverRef} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-800">
        {cachedCoverUrl ? (
          <CoverImage src={cachedCoverUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <Folder size={22} className="text-neutral-400" />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-item font-medium text-white">{folder.title}</span>
      {showAlbum && <span className="hidden w-1/4 md:block" />}
      <CaretRight size={16} className="shrink-0 text-neutral-500" />
    </Link>
  );
}
