export default function SalonsStatusMessages({ error, refreshing, selectedSalon }) {
  return (
    <>
      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
          {error}
        </p>
      )}

      {refreshing && !selectedSalon && (
        <p className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
          Refreshing salons...
        </p>
      )}
    </>
  );
}
