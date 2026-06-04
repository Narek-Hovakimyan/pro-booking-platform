import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatTimeInput } from "@/shared/utils/time";
import api from "@/shared/api/axios";

export default function WaitlistForm({
  barberId,
  salonId,
  serviceId,
  date,
  onClose,
  onSuccess,
}) {
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const payload = {
        barberId,
        serviceId,
        date,
      };

      if (salonId) payload.salonId = salonId;
      if (preferredStartTime) payload.preferredStartTime = preferredStartTime;
      if (preferredEndTime) payload.preferredEndTime = preferredEndTime;
      if (note.trim()) payload.note = note.trim();

      await api.post("/waitlist", payload);

      onSuccess();
    } catch (requestError) {
      const message =
        requestError.response?.data?.message ||
        "Could not join waitlist. Please try again.";

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:rounded-3xl sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold sm:text-xl">Notify me when a time opens</h3>
          <p className="mt-1 text-sm text-neutral-500">
            We'll notify you if a slot may open.
          </p>
        </div>

        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Joining the waitlist does not reserve a time.
        </p>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              Preferred start time (optional)
              <input
                className="rounded-xl border p-2.5 font-normal font-mono tabular-nums"
                inputMode="numeric"
                pattern="[0-9]{2}:[0-9]{2}"
                placeholder="HH:mm"
                value={preferredStartTime}
                onChange={(event) =>
                  setPreferredStartTime(
                    formatTimeInput(event.target.value, preferredStartTime)
                  )
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              Preferred end time (optional)
              <input
                className="rounded-xl border p-2.5 font-normal font-mono tabular-nums"
                inputMode="numeric"
                pattern="[0-9]{2}:[0-9]{2}"
                placeholder="HH:mm"
                value={preferredEndTime}
                onChange={(event) =>
                  setPreferredEndTime(
                    formatTimeInput(event.target.value, preferredEndTime)
                  )
                }
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-semibold">
            Note (optional)
            <textarea
              className="rounded-xl border p-2.5 font-normal"
              maxLength={500}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Any preferences or info..."
            />
          </label>

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Saving..." : "Notify me when a time opens"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
