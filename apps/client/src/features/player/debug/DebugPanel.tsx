import { useEffect, useState } from "react";
import { Activity, Radio, RotateCcw, X } from "lucide-react";
import { usePlayerStore } from "../../../stores/playerStore";
import { cacheStore } from "../../../lib/audio/cache/cacheStore";
import {
  getBandwidthHistory,
  onDebugReset,
  resetDebugStats,
  HISTORY_SECONDS,
  type BandwidthSample,
  type DebugLogEntry,
} from "../../../lib/audio/debug/audioDebugLogger";
import { useDebugEvents } from "./useDebugEvents";

const BANDWIDTH_WINDOW_MS = 1000;
// 100ms de rafraîchissement : tout ce qui est lu à cette cadence (currentCacheSize,
// debugListTasks, getBandwidthHistory) est un accès synchrone à de l'état déjà en mémoire
// (aucune I/O, aucun awake de worker) — voir cacheStore.ts et audioDebugLogger.ts — donc ce
// rythme ne coûte rien de mesurable, contrairement à écrire sur disque à cette fréquence
// (ce que cacheStore fait volontairement plus lentement, en throttled + par-entrée : voir
// META_PERSIST_THROTTLE_MS).
const POLL_INTERVAL_MS = 100;
const TICK_INTERVAL_MS = 100;
const HISTORY_POLL_INTERVAL_MS = 100;
const MAX_LIVE_CHUNKS = 40;

type Tab = "network" | "decode";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** `${trackId}:${qualityId}:v${N}` -> "trackId · qualityId", pour un affichage lisible sans
 *  exposer le détail de versionnage du format de cache (voir cacheKeyFor). */
function formatKey(key: string): string {
  const [trackId, qualityId] = key.split(":");
  return `${trackId?.slice(0, 8) ?? key} · ${qualityId ?? ""}`;
}

interface TaskSnapshot {
  key: string;
  bytesCached: number;
  totalBytes: number;
  complete: boolean;
  protected: boolean;
  error: string | null;
}

/** Bande passante réseau ET décodage ("ffmpeg-like", voir decode:throughput dans
 *  gaplessEngine.decodeAndTrim) sur les 60 dernières secondes, un compartiment par seconde —
 *  partagée entre les deux onglets puisqu'elle ne dépend d'aucun des deux exclusivement. */
function useBandwidthHistory(): BandwidthSample[] {
  const [history, setHistory] = useState<BandwidthSample[]>(() => getBandwidthHistory());

  useEffect(() => {
    const refresh = () => setHistory(getBandwidthHistory());
    const timer = window.setInterval(refresh, HISTORY_POLL_INTERVAL_MS);
    const unsubscribeReset = onDebugReset(refresh);
    return () => {
      window.clearInterval(timer);
      unsubscribeReset();
    };
  }, []);

  return history;
}

function BandwidthHistoryChart({ history }: { history: BandwidthSample[] }) {
  const slots = Array.from({ length: HISTORY_SECONDS }, (_, i) => {
    const offset = HISTORY_SECONDS - history.length;
    return i >= offset ? history[i - offset] : undefined;
  });
  const maxNetwork = Math.max(1, ...history.map((h) => h.networkBytes));
  const maxDecode = Math.max(1, ...history.map((h) => h.decodeBytes));
  const totalNetwork = history.reduce((sum, h) => sum + h.networkBytes, 0);
  const totalDecode = history.reduce((sum, h) => sum + h.decodeBytes, 0);
  const span = Math.max(1, history.length);

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>Bandwidth — last {HISTORY_SECONDS}s</span>
        <span className="flex items-center gap-2.5 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm bg-sky-400" />
            network
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm bg-violet-400" />
            ffmpeg
          </span>
        </span>
      </div>
      <div className="mt-1 flex h-12 items-end gap-px rounded-md bg-neutral-950/60 px-1.5 py-1">
        {slots.map((sample, i) => {
          const netH = sample && sample.networkBytes > 0 ? Math.max(8, (sample.networkBytes / maxNetwork) * 100) : 0;
          const decH = sample && sample.decodeBytes > 0 ? Math.max(8, (sample.decodeBytes / maxDecode) * 100) : 0;
          return (
            <div key={sample?.second ?? `empty-${i}`} className="flex h-full flex-1 items-end gap-px" title={sample ? `net ${formatBytes(sample.networkBytes)} · ffmpeg ${formatBytes(sample.decodeBytes)}` : undefined}>
              <div className="w-full rounded-sm bg-sky-500/70" style={{ height: `${netH}%` }} />
              <div className="w-full rounded-sm bg-violet-500/70" style={{ height: `${decH}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-neutral-600">
        <span>avg net {formatRate(totalNetwork / span)}</span>
        <span>avg ffmpeg {formatRate(totalDecode / span)}</span>
      </div>
    </div>
  );
}

function LiveChunkStrip({ events, trackId }: { events: DebugLogEntry[]; trackId: string | null }) {
  const chunks = trackId
    ? events.filter((e) => e.event === "chunk:read" && typeof e.data.key === "string" && (e.data.key as string).startsWith(`${trackId}:`))
    : [];
  const recent = chunks.slice(-MAX_LIVE_CHUNKS);
  const maxBytes = Math.max(1, ...recent.map((e) => (e.data.bytes as number) ?? 0));

  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-neutral-400">
        <span>Live chunks — current track</span>
        {recent.length > 0 && <span className="tabular-nums text-neutral-600">{recent.length}</span>}
      </div>
      <div className="mt-1 flex h-8 items-end gap-[2px] overflow-hidden rounded-md bg-neutral-950/60 px-1.5 py-1">
        {!trackId ? (
          <span className="self-center text-[10px] text-neutral-600">No track playing</span>
        ) : recent.length === 0 ? (
          <span className="self-center text-[10px] text-neutral-600">Waiting for chunks…</span>
        ) : (
          recent.map((e, i) => {
            const bytes = (e.data.bytes as number) ?? 0;
            const isLast = i === recent.length - 1;
            return (
              <div
                key={e.id}
                title={`${formatBytes(bytes)} @ offset ${e.data.rangeStart}`}
                className={`w-1.5 shrink-0 rounded-sm transition-colors ${isLast ? "animate-pulse bg-emerald-400" : "bg-emerald-600/60"}`}
                style={{ height: `${Math.max(15, (bytes / maxBytes) * 100)}%` }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function NetworkTab() {
  const events = useDebugEvents("network");
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null);
  const [now, setNow] = useState(() => performance.now());
  const [cacheUsed, setCacheUsed] = useState(0);
  const [cacheMax, setCacheMax] = useState(cacheStore.maxCacheBytes);
  const [tasks, setTasks] = useState<TaskSnapshot[]>([]);

  useEffect(() => {
    // Fait décroître le débit affiché dans le temps même sans nouveau chunk (fenêtre glissante) :
    // performance.now() n'est appelé que dans cet effet, jamais pendant le rendu.
    const tickTimer = window.setInterval(() => setNow(performance.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(tickTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const size = await cacheStore.currentCacheSize();
      if (cancelled) return;
      setCacheUsed(size);
      setCacheMax(cacheStore.maxCacheBytes);
      setTasks(cacheStore.debugListTasks());
    };
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const recentReads = events.filter(
    (e) => e.event === "chunk:read" && now - e.ts <= BANDWIDTH_WINDOW_MS,
  );
  const recentBytes = recentReads.reduce((sum, e) => sum + ((e.data.bytes as number) ?? 0), 0);
  const bandwidth = recentBytes / (BANDWIDTH_WINDOW_MS / 1000);

  const readCount = events.filter((e) => e.event === "chunk:read").length;
  const lostCount = events.filter((e) => e.event === "chunk:retry" || e.event === "chunk:lost").length;

  const cachePercent = cacheMax === 0 ? 0 : Math.min(100, (cacheUsed / cacheMax) * 100);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Live speed" value={formatRate(bandwidth)} live />
        <Stat label="Active transfers" value={String(tasks.filter((t) => !t.complete).length)} />
        <Stat label="Chunks read" value={String(readCount)} />
        <Stat label="Chunks lost" value={String(lostCount)} tone={lostCount > 0 ? "warn" : undefined} />
      </div>

      <LiveChunkStrip events={events} trackId={currentTrackId} />

      <div>
        <div className="flex items-baseline justify-between text-[11px] text-neutral-400">
          <span>Cache used</span>
          <span className="tabular-nums">
            {formatBytes(cacheUsed)} / {formatBytes(cacheMax)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              cachePercent >= 95 ? "bg-red-500" : cachePercent >= 80 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${cachePercent}%` }}
          />
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-neutral-400">Transfers</span>
          {tasks.map((t) => {
            const pct = t.totalBytes > 0 ? Math.min(100, (t.bytesCached / t.totalBytes) * 100) : t.complete ? 100 : 0;
            return (
              <div key={t.key} className="text-[11px]">
                <div className="flex items-center justify-between text-neutral-300">
                  <span className="truncate font-mono">{formatKey(t.key)}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500">
                    {t.error ? "error" : t.complete ? "cached" : `${Math.round(pct)}%`}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${t.error ? "bg-red-500" : t.protected ? "bg-emerald-500" : "bg-neutral-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EventLog events={events} />
    </div>
  );
}

function DecodeTab() {
  const events = useDebugEvents("decode");
  const decodeEvents = events.filter((e) => e.event === "decode:throughput");
  const lastDecode = decodeEvents[decodeEvents.length - 1];
  const lastDecodeSpeed = lastDecode
    ? ((lastDecode.data.bytes as number) ?? 0) / (((lastDecode.data.durationMs as number) ?? 1) / 1000)
    : 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Last decode speed" value={lastDecode ? formatRate(lastDecodeSpeed) : "—"} live />
        <Stat label="Tracks decoded" value={String(decodeEvents.length)} />
      </div>
      <EventLog events={events} />
    </div>
  );
}

function EventLog({ events }: { events: DebugLogEntry[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-neutral-400">Live log</span>
      <div className="flex max-h-48 flex-col-reverse overflow-y-auto rounded-md bg-neutral-950/60 p-2 font-mono text-[10.5px] leading-relaxed">
        {events.length === 0 ? (
          <span className="text-neutral-600">Waiting for activity…</span>
        ) : (
          [...events].reverse().map((e) => (
            <div key={e.id} className="truncate text-neutral-400">
              <span className="text-neutral-600">{(e.ts / 1000).toFixed(1)}s</span>{" "}
              <span className="text-neutral-200">{e.event}</span>{" "}
              <span className="text-neutral-500">{summarizeData(e.data)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function summarizeData(data: Record<string, unknown>): string {
  const entries = Object.entries(data).slice(0, 4);
  return entries.map(([k, v]) => `${k}=${typeof v === "number" ? Number(v.toFixed?.(2) ?? v) : v}`).join(" ");
}

function Stat({ label, value, tone, live }: { label: string; value: string; tone?: "warn"; live?: boolean }) {
  return (
    <div className="rounded-md bg-neutral-800/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        {live && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />}
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "warn" ? "text-amber-400" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

export function DebugPanel() {
  const showDebugPanel = usePlayerStore((s) => s.showDebugPanel);
  const toggleDebugPanel = usePlayerStore((s) => s.toggleDebugPanel);
  const [tab, setTab] = useState<Tab>("network");
  const history = useBandwidthHistory();

  if (!showDebugPanel) return null;

  return (
    <div className="fixed bottom-24 right-4 z-40 flex w-80 flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/95 shadow-2xl backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <TabButton icon={<Radio size={12} />} label="Network" active={tab === "network"} onClick={() => setTab("network")} />
          <TabButton icon={<Activity size={12} />} label="Decode" active={tab === "decode"} onClick={() => setTab("decode")} />
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={resetDebugStats} className="text-neutral-500 transition-colors hover:text-white" title="Reset stats">
            <RotateCcw size={13} />
          </button>
          <button onClick={toggleDebugPanel} className="text-neutral-500 transition-colors hover:text-white" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="border-b border-neutral-800 p-3">
        <BandwidthHistoryChart history={history} />
      </div>

      {tab === "network" ? <NetworkTab /> : <DecodeTab />}
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
