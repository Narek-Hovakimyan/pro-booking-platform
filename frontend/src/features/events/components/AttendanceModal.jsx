import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function AttendanceModal({
  isOpen,
  selectedEvent,
  attendanceMessage,
  certificatesMessage,
  isAttendanceLoading,
  attendanceRegistrations,
  isSavingAttendance,
  onClose,
  onAttendanceChange,
  onSaveAttendance,
}) {
  if (!isOpen || !selectedEvent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">
            Attendance - {selectedEvent.title}
          </h2>
          <button
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {attendanceMessage && (
          <p
            className={`mt-3 rounded-xl border p-3 text-sm ${
              attendanceMessage.includes("Could not")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {attendanceMessage}
          </p>
        )}

        {certificatesMessage && (
          <p
            className={`mt-3 rounded-xl border p-3 text-sm ${
              certificatesMessage.includes("Could not") ||
              certificatesMessage.includes("No barbers")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {certificatesMessage}
          </p>
        )}

        {isAttendanceLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-neutral-200"
              />
            ))}
          </div>
        ) : attendanceRegistrations.length === 0 ? (
          <p className="mt-4 text-center text-sm text-neutral-500">
            No approved participants
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {attendanceRegistrations.map((reg) => (
              <div
                key={reg._id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-600">
                    {reg.barberName?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {reg.barberName}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {reg.barberPhone || reg.barberEmail || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status badge */}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      reg.attendanceStatus === "attended"
                        ? "bg-green-100 text-green-700"
                        : reg.attendanceStatus === "no_show"
                          ? "bg-red-100 text-red-700"
                          : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {reg.attendanceStatus === "attended"
                      ? "Attended"
                      : reg.attendanceStatus === "no_show"
                        ? "No Show"
                        : "Pending"}
                  </span>
                  {/* Action buttons */}
                  <button
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      reg.attendanceStatus === "attended"
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-100 text-neutral-600 hover:bg-green-100 hover:text-green-700"
                    }`}
                    onClick={() =>
                      onAttendanceChange(reg.barberId, "attended")
                    }
                  >
                    ✓ Attended
                  </button>
                  <button
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      reg.attendanceStatus === "no_show"
                        ? "bg-red-100 text-red-700"
                        : "bg-neutral-100 text-neutral-600 hover:bg-red-100 hover:text-red-700"
                    }`}
                    onClick={() =>
                      onAttendanceChange(reg.barberId, "no_show")
                    }
                  >
                    ✗ No Show
                  </button>
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full"
                disabled={isSavingAttendance}
                onClick={onSaveAttendance}
              >
                {isSavingAttendance
                  ? "Saving..."
                  : "Save Attendance"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
