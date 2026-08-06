export default function ScheduleManagerAlerts({ displayError, saveSuccess }) {
  return (
    <>
      {displayError && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
          role="alert"
        >
          <strong className="block font-semibold">Error</strong>
          <p className="mt-1">{displayError}</p>
        </div>
      )}
      {saveSuccess && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 shadow-sm"
          role="status"
        >
          {saveSuccess}
        </div>
      )}
    </>
  );
}
