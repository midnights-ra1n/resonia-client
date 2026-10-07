import { PlayerSectionCenter } from "./PlayerSectionCenter";
import { PlayerSectionLeft } from "./PlayerSectionLeft";
import { PlayerSectionRight } from "./PlayerSectionRight";

export function PlayerBar() {
  return (
    // Carte flottante (élévation e3 : ombre + halo carotte) superposée au bas du contenu, voir
    // AppLayout. Fond OPAQUE (pas de backdrop-filter : coût GPU continu sur WebKit/WebView2).
    // Hauteur fixe de 72px : <main> réserve pb-[104px] dessous, DebugPanel se pose au-dessus.
    <div className="flex h-[72px] shrink-0 items-center justify-between rounded-bar border border-white/5 bg-surface-2 px-4 shadow-e3">
      <div className="flex-1 min-w-0">
        <PlayerSectionLeft />
      </div>
      <div className="flex-[2] flex justify-center">
        <PlayerSectionCenter />
      </div>
      <div className="flex-1 min-w-0 flex justify-end">
        <PlayerSectionRight />
      </div>
    </div>
  );
}
