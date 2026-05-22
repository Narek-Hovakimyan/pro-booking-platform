import { X } from "lucide-react";

export default function FilterChip({ label, onRemove }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
      onClick={onRemove}
      type="button"
    >
      {label}
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
