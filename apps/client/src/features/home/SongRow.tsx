type SongRowProps = {
  song: {
    id: string;
    title?: string;
    artist?: string;
    [key: string]: unknown;
  };
  index: number;
  allSongs: Array<unknown>;
};

export function SongRow({ song, index }: SongRowProps) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-950/70">
      <span className="w-6 text-right text-sm font-semibold text-white">{index + 1}</span>
      <div className="min-w-0">
        <p className="truncate text-white">{song.title ?? "Unknown song"}</p>
        <p className="truncate text-sm text-neutral-400">{song.artist ?? "Unknown artist"}</p>
      </div>
    </div>
  );
}
