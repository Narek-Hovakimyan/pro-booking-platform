import { Link } from "react-router-dom";

export default function MyBookingsHeader({ error, view = "active" }) {
  const isHistoryView = view === "history";

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          {isHistoryView ? "Booking History" : "My Bookings"}
        </h1>
        <p className="mt-2 text-neutral-500">
          {isHistoryView
            ? "Քո նախորդ ամրագրումները մեկ տեղում։"
            : "Քո առաջիկա ամրագրումները մեկ տեղում։"}
        </p>
        <nav aria-label="Booking views" className="mt-4 flex gap-2">
          <Link
            aria-current={!isHistoryView ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              !isHistoryView
                ? "bg-neutral-950 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
            to="/my-bookings"
          >
            Upcoming
          </Link>
          <Link
            aria-current={isHistoryView ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              isHistoryView
                ? "bg-neutral-950 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
            to="/booking-history"
          >
            History
          </Link>
        </nav>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}
