import { SubsonicClient } from "@resonia/api-client";
import { useState, type FormEvent } from "react";
import { useTranslation } from "../../lib/i18n";
import { useServersStore } from "../../stores/serversStore";
import { encryptPassword } from "../../lib/security/passwordVault";

export function LoginPage() {
  const addServer = useServersStore((s) => s.addServer);
  const { t, locale, setLocale, supportedLocales } = useTranslation();

  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const client = new SubsonicClient({ url: serverUrl, username, password });
      await client.ping();

      const encryptedPassword = await encryptPassword(password);

      await addServer({
        id: crypto.randomUUID(),
        name: new URL(serverUrl).hostname,
        url: serverUrl,
        username,
        ...client.credentials,
        encryptedPassword,
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-neutral-900 p-8 shadow-xl">

        <div className="flex justify-center items-center">
          <img src="/favicon.svg" alt="Description" className="w-48" />
        </div>

        <h1 className="text-2xl font-bold text-white text-center">{t("auth.login.title")}</h1>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">{t("auth.login.serverUrl")}</label>
          <input
            type="url"
            required
            placeholder={t("auth.login.serverUrlPlaceholder")}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">{t("auth.login.username")}</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">{t("auth.login.password")}</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>

        {/* Sélecteur temporaire — sera déplacé dans la page de paramètres */}
        <div className="flex justify-center gap-2 pt-2 text-xs text-neutral-500">
          {supportedLocales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={l === locale ? "font-semibold text-emerald-400" : "hover:text-neutral-300"}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
