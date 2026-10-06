import type { ContributorDTO, ItemDateDTO } from "@resonia/api-client";
import type { Locale } from "../i18n/types";

type T = (key: string, vars?: Record<string, string | number>) => string;

export function formatFileSize(bytes: number, locale: Locale, t: T): string {
  const nf = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (bytes >= 1024 ** 3) return `${nf(bytes / 1024 ** 3)} ${t("info.unitGb")}`;
  if (bytes >= 1024 ** 2) return `${nf(bytes / 1024 ** 2)} ${t("info.unitMb")}`;
  return `${nf(Math.max(1, Math.round(bytes / 1024)))} ${t("info.unitKb")}`;
}

/** Date ISO du serveur → date lisible ; `undefined` si absente ou invalide. */
export function formatDate(iso: string | undefined, locale: Locale): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** Date partielle OpenSubsonic (année seule, année+mois...). */
export function formatItemDate(date: ItemDateDTO | undefined, locale: Locale): string | undefined {
  if (!date?.year) return undefined;
  if (!date.month) return String(date.year);
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day ?? 1));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    ...(date.day ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(d);
}

export function formatSampleRate(hz: number, locale: Locale, t: T): string {
  const khz = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hz / 1000);
  return t("info.sampleRateValue", { value: khz });
}

export function formatChannels(count: number, t: T): string {
  if (count === 1) return t("info.mono");
  if (count === 2) return t("info.stereo");
  return t("info.channelsCount", { count });
}

export function formatGain(db: number, locale: Locale): string {
  const sign = db > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(db)} dB`;
}

/** Ordre d'affichage des rôles de crédits ; les rôles inconnus suivent, par ordre alphabétique. */
const ROLE_ORDER = [
  "composer",
  "lyricist",
  "producer",
  "arranger",
  "conductor",
  "performer",
  "mixer",
  "engineer",
  "remixer",
  "djmixer",
  "director",
];
// Déjà affichés dans la section principale : jamais répétés comme « crédits ».
const IGNORED_ROLES = new Set(["artist", "albumartist"]);

const ROLE_KEYS: Record<string, string> = {
  composer: "info.roleComposer",
  lyricist: "info.roleLyricist",
  producer: "info.roleProducer",
  arranger: "info.roleArranger",
  conductor: "info.roleConductor",
  performer: "info.rolePerformer",
  mixer: "info.roleMixer",
  engineer: "info.roleEngineer",
  remixer: "info.roleRemixer",
  djmixer: "info.roleDjMixer",
  director: "info.roleDirector",
};

/** Regroupe les crédits OpenSubsonic par rôle (noms dédoublonnés, instrument entre parenthèses
 *  pour les interprètes), dans un ordre stable. */
export function groupContributors(contributors: ContributorDTO[] | undefined, t: T): { label: string; value: string }[] {
  if (!contributors?.length) return [];
  const byRole = new Map<string, string[]>();
  for (const c of contributors) {
    const role = c.role?.toLowerCase();
    if (!role || IGNORED_ROLES.has(role) || !c.artist?.name) continue;
    const name = c.subRole ? `${c.artist.name} (${c.subRole})` : c.artist.name;
    const names = byRole.get(role) ?? [];
    if (!names.includes(name)) names.push(name);
    byRole.set(role, names);
  }
  const rank = (role: string) => {
    const i = ROLE_ORDER.indexOf(role);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  return Array.from(byRole.entries())
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([role, names]) => ({
      label: ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : role.charAt(0).toUpperCase() + role.slice(1),
      value: names.join(", "),
    }));
}

export function joinGenres(genres: { name: string }[] | undefined, genre: string | undefined): string | undefined {
  const names = genres?.map((g) => g.name).filter(Boolean) ?? [];
  if (names.length > 0) return Array.from(new Set(names)).join(", ");
  return genre || undefined;
}
