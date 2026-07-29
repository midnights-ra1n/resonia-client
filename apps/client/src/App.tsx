import { useEffect } from "react";
import { LoginPage } from "./features/auth/LoginPage";
import { useServersStore } from "./stores/serversStore";

function App() {
  const hydrated = useServersStore((s) => s.hydrated);
  const hydrate = useServersStore((s) => s.hydrate);
  const activeServerId = useServersStore((s) => s.activeServerId);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) return null;

  if (!activeServerId) {
    return <LoginPage />;
  }

  return <div className="p-8 text-white">Connecté ! (page d'accueil à venir)</div>;
}

export default App;
