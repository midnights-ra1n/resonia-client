import { X } from "./icons";
import { CoverImage } from "./CoverImage";

interface InfoModalProps {
  title: string;
  coverUrl?: string;
  rows: { label: string; value: string }[];
  onClose: () => void;
}

export function InfoModal({ title, coverUrl, rows, onClose }: InfoModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-panel border border-white/5 bg-surface-2 p-6 shadow-e2 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {coverUrl && (
          <div className="mx-auto mb-4 h-32 w-32 overflow-hidden rounded-lg bg-neutral-800">
            <CoverImage src={coverUrl} alt="" className="h-full w-full object-cover" decoding="async" />
          </div>
        )}

        <dl className="space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 border-b border-neutral-800 pb-2 text-sm">
              <dt className="text-neutral-400">{label}</dt>
              <dd className="truncate text-right text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
