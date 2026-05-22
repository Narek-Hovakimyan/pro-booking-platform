export default function SalonsStatusMessages({ error, refreshing, selectedSalon }) {
  return (
    <>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {refreshing && !selectedSalon && (
        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          Refreshing salons...
        </p>
      )}
    </>
  );
}
