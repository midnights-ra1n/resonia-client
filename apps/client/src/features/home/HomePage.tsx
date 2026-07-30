import { useTranslation } from "../../lib/i18n";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">{t("home.greeting")}</h1>
      {/* Sections à venir : reprises récentes, playlists, titres les plus joués */}
    </div>
  );
}
