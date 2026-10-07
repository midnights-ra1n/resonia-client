import { useTranslation } from "../../lib/i18n";
import {
  DEFAULT_FONT,
  FONTS,
  useAppearanceStore,
  type FontId,
  type LyricsFontId,
} from "../../lib/appearance/fonts";
import { DEFAULT_THEME, THEMES, useThemeStore } from "../../lib/appearance/themes";

const SELECT_CLASS =
  "select-pill mt-2 w-full rounded-full bg-neutral-900 border border-neutral-700 pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-[color,background-color,border-color,box-shadow]";

/** Paramètres → Apparence : thème de couleurs, police de l'interface et police des paroles. Le choix s'applique
 *  en direct à toute l'app (variables CSS), les aperçus ci-dessous le reflètent donc sans
 *  logique propre. */
export function AppearanceSection() {
  const { t } = useTranslation();
  const uiFont = useAppearanceStore((s) => s.uiFont);
  const lyricsFont = useAppearanceStore((s) => s.lyricsFont);
  const setUiFont = useAppearanceStore((s) => s.setUiFont);
  const setLyricsFont = useAppearanceStore((s) => s.setLyricsFont);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const fontLabel = (id: FontId, label: string) =>
    id === DEFAULT_FONT ? `${label} ${t("settings.fontDefaultSuffix")}` : label;

  return (
    <section>
      <h2 className="text-lg font-semibold">{t("settings.appearance")}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t("settings.fontsLocalNote")}</p>

      <div className="mt-6 flex flex-col gap-8">
        <div>
          <p id="theme-picker-label" className="block text-sm font-medium text-white">
            {t("settings.theme")}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{t("settings.themeDescription")}</p>
          <div
            role="radiogroup"
            aria-labelledby="theme-picker-label"
            className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
          >
            {THEMES.map((th) => {
              const selected = th.id === theme;
              // Aperçu en couleurs fixes (celles du thème représenté, pas du thème actif).
              const [bg, surface, text, accent] = th.swatch;
              return (
                <button
                  key={th.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(th.id)}
                  className={`rounded-panel border p-2 text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected ? "border-accent shadow-e1" : "border-white/5 hover:border-neutral-600"
                  }`}
                >
                  <div className="flex h-14 gap-1.5 rounded-cover p-1.5" style={{ backgroundColor: bg }} aria-hidden="true">
                    <div className="w-1/4 rounded-md" style={{ backgroundColor: surface }} />
                    <div className="flex flex-1 flex-col justify-between rounded-md p-1.5" style={{ backgroundColor: surface }}>
                      <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: text }} />
                      <div className="h-1.5 w-1/2 rounded-full opacity-50" style={{ backgroundColor: text }} />
                      <div className="h-3 w-3 self-end rounded-full" style={{ backgroundColor: accent }} />
                    </div>
                  </div>
                  <p className="mt-2 truncate px-0.5 text-xs font-medium text-white">
                    {th.id === DEFAULT_THEME ? `${th.label} ${t("settings.themeDefaultSuffix")}` : th.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

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
