import { PlayerSectionCenter } from "./PlayerSectionCenter";
import { PlayerSectionLeft } from "./PlayerSectionLeft";
import { PlayerSectionRight } from "./PlayerSectionRight";

export function PlayerBar() {
  return (
    <div className="flex items-center justify-between h-20 bg-neutral-900 border-t border-neutral-800 px-4 shrink-0">
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
