import { SubsonicApiError, SubsonicClient } from "@resonia/api-client";
import { useState, type FormEvent } from "react";
import { useServersStore } from "../../stores/serversStore";

export function LoginPage() {
  const addServer = useServersStore((s) => s.addServer);

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

      await addServer({
        id: crypto.randomUUID(),
        name: new URL(serverUrl).hostname,
        url: serverUrl,
        username,
        ...client.credentials,
        createdAt: Date.now(),
      });
    } catch (err) {
      if (err instanceof SubsonicApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-neutral-900 p-8 shadow-xl">

        <div className="flex justify-center items-center">
          <img src="/favicon.svg" alt="Logo Resonia" className="w-64" />
        </div>

        <h1 className="text-2xl font-bold text-white text-center">Login</h1>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Server URL</label>
          <input
            type="url"
            required
            placeholder="https://music.example.com"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Username</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Password</label>
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
          {loading ? "Connecting..." : "Login"}
        </button>
      </form>
    </div>
  );
}
