import { useTranslation } from "../../lib/i18n";
import {
  DEFAULT_FONT,
  FONTS,
  useAppearanceStore,
  type FontId,
  type LyricsFontId,
} from "../../lib/appearance/fonts";

const SELECT_CLASS =
  "select-pill mt-2 w-full rounded-full bg-neutral-900 border border-neutral-700 pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-[color,background-color,border-color,box-shadow]";

/** Paramètres → Apparence : police de l'interface et police des paroles. Le choix s'applique
 *  en direct à toute l'app (variables CSS), les aperçus ci-dessous le reflètent donc sans
 *  logique propre. */
export function AppearanceSection() {
  const { t } = useTranslation();
  const uiFont = useAppearanceStore((s) => s.uiFont);
  const lyricsFont = useAppearanceStore((s) => s.lyricsFont);
  const setUiFont = useAppearanceStore((s) => s.setUiFont);
  const setLyricsFont = useAppearanceStore((s) => s.setLyricsFont);

  const fontLabel = (id: FontId, label: string) =>
    id === DEFAULT_FONT ? `${label} ${t("settings.fontDefaultSuffix")}` : label;

  return (
    <section>
      <h2 className="text-lg font-semibold">{t("settings.appearance")}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t("settings.fontsLocalNote")}</p>

      <div className="mt-6 flex flex-col gap-8">
        <div>
          <label htmlFor="ui-font-select" className="block text-sm font-medium text-white">
            {t("settings.interfaceFont")}
          </label>
          <p className="mt-1 text-xs text-neutral-500">{t("settings.interfaceFontDescription")}</p>
          <select
            id="ui-font-select"
            value={uiFont}
            onChange={(e) => setUiFont(e.target.value as FontId)}
            className={SELECT_CLASS}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {fontLabel(f.id, f.label)}
              </option>
            ))}
          </select>

          <div className="mt-3 rounded-panel border border-white/5 bg-surface-2 p-4 shadow-e1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
              {t("settings.fontPreview")}
            </p>
            <p className="mt-2 text-[26px] font-bold leading-[1.05] text-white">Resonia</p>
            <p className="mt-1 text-[15px] text-neutral-300">{t("settings.fontPreviewSample")}</p>
          </div>
        </div>

        <div>
          <label htmlFor="lyrics-font-select" className="block text-sm font-medium text-white">
            {t("settings.lyricsFont")}
          </label>
          <p className="mt-1 text-xs text-neutral-500">{t("settings.lyricsFontDescription")}</p>
          <select
            id="lyrics-font-select"
            value={lyricsFont}
            onChange={(e) => setLyricsFont(e.target.value as LyricsFontId)}
            className={SELECT_CLASS}
          >
            <option value="same">{t("settings.lyricsFontSame")}</option>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <div
            className="mt-3 rounded-panel border border-white/5 bg-surface-2 p-4 text-center shadow-e1"
            style={{ fontFamily: "var(--font-lyrics, var(--font-sans))" }}
          >
            <p className="text-2xl font-medium text-white/50">{t("settings.lyricsPreviewPrevious")}</p>
            <p className="mt-2 text-3xl font-bold text-white">{t("settings.lyricsPreviewActive")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
