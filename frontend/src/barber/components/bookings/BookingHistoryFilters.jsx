const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "no_show", label: "No-show" },
  { value: "late_cancelled", label: "Late cancellation" },
];

export default function BookingHistoryFilters({ filters, onChange, onReset }) {
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="px-1 text-sm font-semibold">Filter history</legend>
      <label className="grid gap-1 text-sm font-medium">From date
        <input aria-label="From date" className="rounded-lg border p-2" type="date" value={filters.fromDate} onChange={(event) => onChange("fromDate", event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-medium">To date
        <input aria-label="To date" className="rounded-lg border p-2" type="date" value={filters.toDate} onChange={(event) => onChange("toDate", event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Status
        <select aria-label="Status" className="rounded-lg border p-2" value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Client search
        <input aria-label="Client search" className="rounded-lg border p-2" type="search" value={filters.clientSearch} onChange={(event) => onChange("clientSearch", event.target.value)} />
      </label>
      <button className="justify-self-start rounded-lg border px-3 py-2 text-sm font-medium" type="button" onClick={onReset}>Reset filters</button>
    </fieldset>
  );
}
