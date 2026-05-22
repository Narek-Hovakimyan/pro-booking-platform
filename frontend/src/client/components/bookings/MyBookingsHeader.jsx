export default function MyBookingsHeader({ error }) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          My Bookings
        </h1>
        <p className="mt-2 text-neutral-500">
          Քո բոլոր ամրագրումները մեկ տեղում։
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
