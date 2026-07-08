export function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400">{sub}</p>}
    </div>
  );
}