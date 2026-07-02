export default function MyBookingsHeader({ error }) {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          My Bookings
        </h1>
        <p className="mt-2 text-neutral-500">
          Քո բոլոր ամրագրումները մեկ տեղում։
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}