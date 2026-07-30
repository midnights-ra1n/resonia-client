import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";

export function HomePage() {
  const { t } = useTranslation();
  const activeServer = useServersStore((state) =>
    state.servers.find((s) => s.id === state.activeServerId)
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">
        {t("home.greeting", { username: activeServer?.username ?? "" })}
      </h1>
      {/* upcoming: recent releases, playlists, top tracks */}
    </div>
  );
}
