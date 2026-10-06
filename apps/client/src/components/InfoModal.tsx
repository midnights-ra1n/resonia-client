import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "./icons";
import { CoverImage } from "./CoverImage";
import { useTranslation } from "../lib/i18n/useTranslation";

export interface InfoRow {
  label: string;
  value: ReactNode;
  /** Valeur technique longue (chemin de fichier, identifiant) : police mono, coupure libre. */
  mono?: boolean;
}

export interface InfoSection {
  title?: string;
  rows: InfoRow[];
  /** Affiché à la place des lignes quand la section est vide (ex: aucun crédit dans les tags). */
  emptyText?: string;
}

interface InfoModalProps {
  title: string;
  /** Ligne secondaire sous le titre (artiste, propriétaire...). */
  subtitle?: string;
  /** Nature de l'élément (Titre, Album, Playlist), affichée au-dessus du titre. */
  kind?: string;
  coverUrl?: string;
  /** Pastilles courtes à côté de l'en-tête (format, qualité, explicite...). */
  badges?: string[];
  /** Forme simple : une seule section sans titre. */
  rows?: InfoRow[];
  sections?: InfoSection[];
  /** Détails complémentaires en cours de chargement (fiche serveur). */
  loading?: boolean;
  /** Fiche complète indisponible : seules les infos déjà connues sont affichées. */
  notice?: string;
  onClose: () => void;
}

export function InfoModal({ title, subtitle, kind, coverUrl, badges, rows, sections, loading, notice, onClose }: InfoModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allSections: InfoSection[] = [...(rows && rows.length > 0 ? [{ rows }] : []), ...(sections ?? [])].filter(
    (s) => s.rows.length > 0 || s.emptyText,
  );

  // Porté dans <body> : rendue à l'intérieur d'une ligne de liste (`content-visibility: auto`,
  // voir .track-row-cv) ou d'une page en transition (`transform`), la modale `fixed` prenait cet
  // ancêtre pour repère au lieu de la fenêtre — centrée au milieu de la liste entière, hors écran.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[min(84vh,680px)] w-full max-w-[440px] flex-col overflow-hidden rounded-panel border border-white/5 bg-surface-2 shadow-e2 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête compact : pochette à gauche, identité à droite — plus de grande pochette
            centrée qui occupait la moitié de la fenêtre pour une seule image. */}
        <div className="relative flex shrink-0 items-center gap-4 border-b border-white/5 p-4 pr-12">
          {coverUrl && (
            <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-neutral-800 shadow-e1">
              <CoverImage src={coverUrl} alt="" className="h-full w-full object-cover" decoding="async" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {kind && <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{kind}</p>}
            <h2 className="line-clamp-2 text-base font-bold leading-snug text-white">{title}</h2>
            {subtitle && <p className="truncate text-[13px] text-neutral-400">{subtitle}</p>}
            {badges && badges.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-neutral-300"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t("info.close")}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 select-text">
          {allSections.map((section, i) => (
            <section key={section.title ?? i} className="pt-3.5">
              {section.title && (
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{section.title}</h3>
              )}
              {section.rows.length > 0 ? (
                <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px] leading-snug">
                  {section.rows.map(({ label, value, mono }) => (
                    <div key={label} className="contents">
                      <dt className="truncate text-neutral-400">{label}</dt>
                      <dd className={`text-white ${mono ? "break-all font-mono text-[11.5px] text-neutral-300" : "break-words"}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-[13px] text-neutral-500">{section.emptyText}</p>
              )}
            </section>
          ))}

          {loading && (
            <p className="flex items-center gap-2 pt-3.5 text-[12px] text-neutral-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-600 border-t-accent" />
              {t("info.loading")}
            </p>
          )}
          {notice && !loading && <p className="pt-3.5 text-[12px] text-neutral-500">{notice}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
