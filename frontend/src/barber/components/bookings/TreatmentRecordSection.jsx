import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";

const FIELDS = [
  { key: "colorFormula", label: "Color formula", placeholder: "e.g. 7N + 6G" },
  { key: "tonerFormula", label: "Toner formula", placeholder: "e.g. 10V with 10 vol" },
  { key: "developer", label: "Developer", placeholder: "e.g. 20 vol" },
  { key: "processingTime", label: "Processing time", placeholder: "e.g. 35 min" },
  { key: "productsUsed", label: "Products used", placeholder: "e.g. Olaplex No.3, Shampoo X" },
  { key: "techniqueNotes", label: "Technique notes", placeholder: "e.g. Balayage, foilyage" },
  { key: "outcomeNotes", label: "Outcome notes", placeholder: "e.g. Client satisfied with result" },
  { key: "reactionNotes", label: "Reaction notes", placeholder: "e.g. No irritation observed" },
];

const canShowTreatmentRecord = (status) =>
  status === "accepted" || status === "completed";

const getBookingId = (booking) => booking?.id || booking?._id || "";

export default function TreatmentRecordSection({ booking, status }) {
  const existingRecord = booking?.treatmentRecord;
  const hasExistingData = existingRecord && Object.values(existingRecord).some((v) => v);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Initialize form state from existing record
  const [form, setForm] = useState(() => {
    const initial = {};
    if (existingRecord) {
      for (const field of FIELDS) {
        initial[field.key] = existingRecord[field.key] || "";
      }
    } else {
      for (const field of FIELDS) {
        initial[field.key] = "";
      }
    }
    return initial;
  });

  if (!canShowTreatmentRecord(status)) return null;

  const bookingId = getBookingId(booking);
  if (!bookingId) return null;

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setIsSaving(true);

    // Build payload with only whitelisted fields — no unsafe fields sent
    const payload = {};
    for (const field of FIELDS) {
      payload[field.key] = form[field.key] || "";
    }

    try {
      await api.put(`/bookings/${bookingId}/treatment-record`, payload);
      setSuccess("Treatment record saved");
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not save treatment record"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
      <button
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-blue-800"
        onClick={() => setIsExpanded((prev) => !prev)}
        type="button"
      >
        <span>Treatment Record</span>
        <span className="flex items-center gap-1.5">
          {hasExistingData && !isExpanded && (
            <span className="rounded-full bg-blue-200 px-1.5 py-0.5 text-[10px] text-blue-800">
              Saved
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label
                className="mb-1 block text-xs font-medium text-blue-900"
                htmlFor={`treatment-${field.key}`}
              >
                {field.label}
              </label>
              <textarea
                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                id={`treatment-${field.key}`}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={2}
                value={form[field.key]}
              />
            </div>
          ))}

          {error && (
            <p className="rounded-lg bg-red-100 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-lg bg-emerald-100 p-2 text-xs text-emerald-700">
              {success}
            </p>
          )}

          <Button
            className="w-full"
            disabled={isSaving}
            onClick={handleSave}
            size="sm"
          >
            {isSaving ? "Saving..." : "Save treatment record"}
          </Button>
        </div>
      )}
    </div>
  );
}
