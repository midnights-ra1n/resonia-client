import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NavidromeSong } from "@resonia/api-client";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCachedQuery } from "../../lib/cache/queryCache";
import { formatAlbumDuration } from "../../lib/format/duration";
import { useTranslation } from "../../lib/i18n";
import { computeLocalStats, computeServerStats, type Period, type Ranked } from "../../lib/stats/computeStats";
import { getPlays, type PlayRecord } from "../../lib/stats/listeningHistory";
import { getClientForServer } from "../../lib/subsonic/getClientForServer";
import { getNativeClientForServer } from "../../lib/subsonic/getNativeClientForServer";
import { useServersStore, type StoredServer } from "../../stores/serversStore";

// Les compteurs ne bougent qu'au fil des écoutes : inutile de tout relire à chaque visite.
const SERVER_STATS_STALE_MS = 10 * 60_000;
const PAGE_SIZE = 500;
const PERIODS: Period[] = ["week", "month", "all"];

/** Tous les titres écoutés au moins une fois (tri serveur par nombre d'écoutes : on s'arrête au
 *  premier jamais écouté), plus le nombre total de titres de la bibliothèque. null : API native
 *  Navidrome indisponible. */
async function fetchPlayedSongs(server: StoredServer): Promise<{ songs: NavidromeSong[]; total: number | null } | null> {
  const native = await getNativeClientForServer(server);
  if (!native) return null;
  const songs: NavidromeSong[] = [];
  let total: number | null = null;
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await native.getSongs({ sort: "playCount", order: "DESC", start, end: start + PAGE_SIZE });
    total ??= page.total;
    const played = page.songs.filter((s) => (s.playCount ?? 0) > 0);
    songs.push(...played);
    if (played.length < page.songs.length || page.songs.length < PAGE_SIZE) return { songs, total };
  }
}

export function StatsPage() {
  const { t, locale } = useTranslation();
  const fmt = formatters(locale);
  const server = useServersStore((s) => s.servers.find((x) => x.id === s.activeServerId));

  const played = useCachedQuery(server ? `${server.id}:stats:played` : null, () => fetchPlayedSongs(server!), SERVER_STATS_STALE_MS);
  const starred = useCachedQuery(
    server ? `${server.id}:stats:starred` : null,
    () => getClientForServer(server!).getStarred2(),
    SERVER_STATS_STALE_MS,
  );
  const serverStats = useMemo(() => played.data && computeServerStats(played.data.songs, played.data.total), [played.data]);

  if (played.loading && !played.data) return <PageSkeleton />;

  return (
    <div className="px-8 pb-12 pt-10">
      <h1 className="text-5xl font-black text-white">{t("stats.title")}</h1>

      <Section title={t("stats.serverSection")} hint={t("stats.serverHint")}>
        {!serverStats ? (
          <p className="text-neutral-400">{t("stats.serverUnavailable")}</p>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
              <StatTile label={t("stats.plays")} value={fmt.number(serverStats.totalPlays)} />
              <StatTile label={t("stats.listeningTime")} value={formatAlbumDuration(serverStats.totalSec, t)} hint={t("stats.listeningTimeServerHint")} />
              <StatTile
                label={t("stats.songsPlayed")}
                value={fmt.number(serverStats.distinctSongs)}
                hint={serverStats.coverage !== null ? t("stats.coverage", { percent: fmt.percent(serverStats.coverage) }) : undefined}
              />
              <StatTile label={t("stats.artistsPlayed")} value={fmt.number(serverStats.distinctArtists)} />
              <StatTile label={t("stats.albumsPlayed")} value={fmt.number(serverStats.distinctAlbums)} />
              {starred.data && <StatTile label={t("stats.favorites")} value={fmt.number(starred.data.length)} />}
              {serverStats.lastPlayedAt && <StatTile label={t("stats.lastPlayed")} value={fmt.date(serverStats.lastPlayedAt)} />}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              <RankList title={t("stats.topSongs")} items={serverStats.topSongs} value={(r) => t("stats.playCount", { count: r.plays })} />
              <RankList title={t("stats.topArtists")} items={serverStats.topArtists} value={(r) => t("stats.playCount", { count: r.plays })} />
              <RankList title={t("stats.topAlbums")} items={serverStats.topAlbums} value={(r) => t("stats.playCount", { count: r.plays })} />
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              <BarList title={t("stats.genres")} items={serverStats.genres} value={(r) => r.plays} format={(v) => t("stats.playCount", { count: v })} />
              <BarList title={t("stats.decades")} items={serverStats.decades} value={(r) => r.plays} format={(v) => t("stats.playCount", { count: v })} />
              <BarList title={t("stats.formats")} items={serverStats.formats} value={(r) => r.plays} format={(v) => t("stats.playCount", { count: v })} />
            </div>
          </>
        )}
      </Section>

      {server && <LocalStats serverId={server.id} />}
    </div>
  );
}

function LocalStats({ serverId }: { serverId: string }) {
  const { t, locale } = useTranslation();
  // Heure figée au chargement : les périodes « 7 jours », « 30 jours » se calculent par rapport à elle.
  const [history, setHistory] = useState<{ plays: PlayRecord[]; loadedAt: number } | null>(null);
  const [period, setPeriod] = useState<Period>("month");

  useEffect(() => {
    let cancelled = false;
    getPlays(serverId)
      .then((plays) => !cancelled && setHistory({ plays, loadedAt: Date.now() }))
      .catch((err) => {
        console.warn("[stats] Historique local illisible", err);
        if (!cancelled) setHistory({ plays: [], loadedAt: Date.now() });
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const stats = useMemo(() => history && computeLocalStats(history.plays, period, history.loadedAt), [history, period]);
  if (!history || !stats) return null;
  const { plays } = history;

  const fmt = formatters(locale);
  const formatTime = (sec: number) => formatAlbumDuration(sec, t);
  const dayFormat = new Intl.DateTimeFormat(locale, period === "all" ? { month: "short" } : { day: "numeric", month: "short" });
  const hourFormat = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 5 janvier 2026 : un lundi (les jours sont rangés lundi en premier).
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => weekdayFormat.format(new Date(2026, 0, 5 + i)));

  return (
    <Section
      title={t("stats.localSection")}
      hint={plays.length ? t("stats.localHint", { date: fmt.date(stats.firstPlayAt) }) : t("stats.localHintEmpty")}
      action={
        <div className="flex gap-2" role="group" aria-label={t("stats.period")}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={p === period}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${p === period ? "bg-white text-black" : "bg-surface-2 text-white hover:bg-surface-3"}`}
            >
              {t(`stats.period_${p}`)}
            </button>
          ))}
        </div>
      }
    >
      {plays.length === 0 ? (
        <p className="text-neutral-400">{t("stats.localEmpty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            <StatTile label={t("stats.listeningTime")} value={formatTime(stats.totalSec)} />
            <StatTile label={t("stats.plays")} value={fmt.number(stats.plays)} />
            <StatTile label={t("stats.avgPerDay")} value={formatTime(stats.avgPerActiveDaySec)} hint={t("stats.activeDays", { count: stats.activeDays })} />
            <StatTile label={t("stats.songsPlayed")} value={fmt.number(stats.distinctTracks)} />
            <StatTile label={t("stats.artistsPlayed")} value={fmt.number(stats.distinctArtists)} />
            <StatTile label={t("stats.skipRate")} value={t("stats.percent", { value: fmt.percent(stats.skipRate) })} hint={t("stats.skipRateHint")} />
            <StatTile
              label={t("stats.streak")}
              value={t("stats.days", { count: stats.streak.current })}
              hint={t("stats.longestStreak", { count: stats.streak.longest })}
            />
          </div>

          <div className="mt-8">
            <Columns
              title={t(period === "all" ? "stats.timelineMonths" : "stats.timelineDays")}
              values={stats.timeline.map((b) => b.seconds)}
              labels={stats.timeline.map((b) => dayFormat.format(b.start))}
              format={formatTime}
            />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <Columns
              title={t("stats.hours")}
              values={stats.hours}
              labels={stats.hours.map((_, h) => hourFormat.format(new Date(2026, 0, 1, h)))}
              format={formatTime}
            />
            <Columns title={t("stats.weekdays")} values={stats.weekdays} labels={weekdayLabels} format={formatTime} allLabels />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <RankList title={t("stats.topSongs")} items={stats.topTracks} value={(r) => formatTime(r.seconds)} />
            <RankList title={t("stats.topArtists")} items={stats.topArtists} value={(r) => formatTime(r.seconds)} />
            <RankList title={t("stats.topAlbums")} items={stats.topAlbums} value={(r) => formatTime(r.seconds)} />
          </div>
        </>
      )}
    </Section>
  );
}

/** Nombres, pourcentages et dates dans la langue de l'app (et non celle du système). */
function formatters(locale: string) {
  return {
    number: (n: number) => n.toLocaleString(locale),
    percent: (ratio: number) => (ratio * 100).toLocaleString(locale, { maximumFractionDigits: 1 }),
    date: (ts: number) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
  };
}

function Section({ title, hint, action, children }: { title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-neutral-400">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function RankList({ title, items, value }: { title: string; items: Ranked[]; value: (item: Ranked) => string }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-base font-bold text-white">{title}</h3>
      <ol className="flex flex-col gap-1">
        {items.map((item, i) => {
          const name = <span className="block truncate text-item font-medium text-white">{item.name}</span>;
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-neutral-800/80">
              <span className="w-5 shrink-0 text-right text-sm tabular-nums text-neutral-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {item.to ? (
                  <Link to={item.to} className="hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}
                {item.sub && <span className="block truncate text-item-sub text-neutral-400">{item.sub}</span>}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-neutral-400">{value(item)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Barres horizontales : une catégorie par ligne, libellé et valeur en texte (pas de couleur seule). */
function BarList({ title, items, value, format }: { title: string; items: Ranked[]; value: (item: Ranked) => number; format: (v: number) => string }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map(value));
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-base font-bold text-white">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="truncate text-white">{item.name}</span>
              <span className="shrink-0 tabular-nums text-neutral-400">{format(value(item))}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${max ? value(item) / max : 0})` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colonnes verticales (une série) : valeur au survol, quelques repères sous l'axe. */
function Columns({ title, values, labels, format, allLabels }: { title: string; values: number[]; labels: string[]; format: (v: number) => string; allLabels?: boolean }) {
  const max = Math.max(...values);
  const step = allLabels ? 1 : Math.ceil(values.length / 6);
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-base font-bold text-white">{title}</h3>
      <div className="flex h-36 items-end gap-0.5 border-b border-neutral-800" role="list">
        {values.map((v, i) => (
          <div
            key={i}
            role="listitem"
            title={`${labels[i]} · ${format(v)}`}
            aria-label={`${labels[i]} : ${format(v)}`}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: `${max ? (v / max) * 100 : 0}%`, minHeight: v > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[11px] text-neutral-500">
        {labels.map((label, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center">
            {i % step === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
