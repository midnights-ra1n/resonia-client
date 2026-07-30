import { Outlet } from "react-router-dom";
import { PlayerBar } from "../../features/player/PlayerBar";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex h-screen bg-neutral-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <PlayerBar />
      </div>
    </div>
  );
}
