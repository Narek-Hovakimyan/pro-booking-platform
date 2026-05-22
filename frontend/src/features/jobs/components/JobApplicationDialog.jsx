import { CheckCircle2, Copy, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";

function getJobId(job) {
  return job?.id || job?._id;
}

function getPhoneHref(contactInfo = "") {
  const normalizedPhone = contactInfo.trim().replace(/[\s().-]/g, "");

  if (!/^\+?\d{6,15}$/.test(normalizedPhone)) {
    return "";
  }

  return `tel:${normalizedPhone}`;
}

export default function JobApplicationDialog({
  currentUser = null,
  isAuthenticated = false,
  job,
  onApplied,
  onClose,
}) {
  const [form, setForm] = useState({
    message: "",
    experience: "",
    contactInfo: currentUser?.phone || "",
  });
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (!job) return null;

  const jobId = getJobId(job);
  const salon = job?.salon || {};
  const salonContactInfo = job?.contactInfo?.trim() || "";
  const phoneHref = getPhoneHref(salonContactInfo);
  const canCopy = Boolean(
    salonContactInfo &&
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
  );
  const isBarber = currentUser?.role === "barber";
  const canSubmit = isAuthenticated && isBarber && !successMessage;

  const updateField = (field, value) => {
    setError("");
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const copyContactInfo = async () => {
    if (!canCopy) return;

    try {
      await navigator.clipboard.writeText(salonContactInfo);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Could not copy");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.message.trim()) {
      setError("Message is required");
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post(`/salon-jobs/${jobId}/applications`, {
        message: form.message.trim(),
        experience: form.experience.trim(),
        contactInfo: form.contactInfo.trim(),
      });

      setSuccessMessage("Application sent");
      onApplied?.(jobId);
    } catch (requestError) {
      const message =
        requestError.response?.data?.message || "Could not submit application";

      if (requestError.response?.status === 409) {
        setSuccessMessage(message);
        onApplied?.(jobId);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      aria-labelledby="job-application-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close application dialog"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0">
            <h2
              className="text-xl font-bold tracking-tight text-neutral-950"
              id="job-application-title"
            >
              Apply
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {job?.title || "Untitled job"} at {salon?.name || "Salon"}
            </p>
          </div>
          <Button
            aria-label="Close application dialog"
            onClick={onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {!isAuthenticated ? (
            <div className="space-y-4">
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                Please log in to apply
              </p>
              <Button as={Link} className="w-full" to="/login">
                Log in
              </Button>
            </div>
          ) : !isBarber ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              Only professionals can apply to jobs.
            </p>
          ) : successMessage ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{successMessage}</span>
                </p>
              </div>
              <Button className="w-full" onClick={onClose} type="button">
                Done
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Message
                <textarea
                  className="min-h-32 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950"
                  disabled={isSubmitting}
                  onChange={(event) => updateField("message", event.target.value)}
                  placeholder="Tell the salon why you are interested."
                  required
                  value={form.message}
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Experience
                <textarea
                  className="min-h-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950"
                  disabled={isSubmitting}
                  onChange={(event) =>
                    updateField("experience", event.target.value)
                  }
                  placeholder="Share relevant experience, specialties, or availability."
                  value={form.experience}
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Contact info
                <input
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                  disabled={isSubmitting}
                  onChange={(event) =>
                    updateField("contactInfo", event.target.value)
                  }
                  placeholder="Phone, email, or preferred contact method"
                  value={form.contactInfo}
                />
              </label>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button className="w-full" disabled={!canSubmit || isSubmitting} type="submit">
                {isSubmitting ? "Sending..." : "Send application"}
              </Button>
            </form>
          )}

          <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-700">
              Salon contact
            </p>
            {salonContactInfo ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
                {salonContactInfo}
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                No contact information provided. Please contact the salon directly.
              </p>
            )}

            {(phoneHref || canCopy) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {phoneHref && (
                  <Button as="a" href={phoneHref} variant="outline">
                    <Phone className="mr-2 h-4 w-4" />
                    Call
                  </Button>
                )}
                {canCopy && (
                  <Button
                    onClick={copyContactInfo}
                    type="button"
                    variant="outline"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                )}
              </div>
            )}

            {copyStatus && (
              <p className="mt-3 text-sm font-semibold text-neutral-500">
                {copyStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
