import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../lib/i18n";

interface ConfirmDeleteModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-neutral-300">{message}</p>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full bg-neutral-800 py-2.5 font-semibold text-white transition hover:bg-neutral-700"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 rounded-full bg-red-500 py-2.5 font-semibold text-black transition hover:bg-red-400 disabled:opacity-50"
          >
            {submitting ? t("common.loading") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
