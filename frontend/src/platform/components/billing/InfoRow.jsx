export function InfoRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className={`text-sm text-neutral-900 ${valueClass}`}>{value || "—"}</span>
    </div>
  );
}