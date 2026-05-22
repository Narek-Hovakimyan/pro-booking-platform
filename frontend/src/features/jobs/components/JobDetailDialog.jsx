import {
  BriefcaseBusiness,
  Building2,
  Copy,
  MapPin,
  Phone,
  Scissors,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

const ROLE_LABELS = {
  barber: "Barber",
  hairdresser: "Hairdresser",
  "nail-artist": "Nail artist",
  "makeup-artist": "Makeup artist",
  receptionist: "Receptionist",
  other: "Other",
};

const EMPLOYMENT_TYPE_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  commission: "Commission",
  "rent-chair": "Rent chair",
};

function getRoleLabel(job) {
  if (job?.role === "other" && job?.customRole) {
    return `Other: ${job.customRole}`;
  }
  return ROLE_LABELS[job?.role] || job?.role || "Role not specified";
}

function getEmploymentTypeLabel(employmentType) {
  return (
    EMPLOYMENT_TYPE_LABELS[employmentType] ||
    employmentType ||
    "Employment type not specified"
  );
}

function getSalonLocation(salon) {
  return [salon?.city, salon?.address].filter(Boolean).join(", ");
}

function getPhoneHref(contactInfo = "") {
  const normalizedPhone = contactInfo.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{6,15}$/.test(normalizedPhone)) {
    return "";
  }
  return `tel:${normalizedPhone}`;
}

export default function JobDetailDialog({
  isApplied = false,
  job,
  onClose,
  onApply,
}) {
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!job) return null;

  const salon = job?.salon || {};
  const salonLocation = getSalonLocation(salon);
  const salonImage = salon?.imageUrl || salon?.image || "";
  const contactInfo = job?.contactInfo?.trim() || "";
  const phoneHref = getPhoneHref(contactInfo);
  const canCopy = Boolean(contactInfo && navigator?.clipboard?.writeText);

  const copyContactInfo = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(contactInfo);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Could not copy");
    }
  };

  return (
    <div
      aria-labelledby="job-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close details"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0">
            <h2
              className="text-xl font-bold tracking-tight text-neutral-950"
              id="job-detail-title"
            >
              {job?.title || "Untitled job"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {salon?.name || "Salon"}
            </p>
          </div>
          <Button
            aria-label="Close details"
            onClick={onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5">
            {/* Salon image */}
            {salonImage ? (
              <img
                alt={`Photos of ${salon?.name || "salon"}`}
                className="aspect-[4/3] w-full rounded-2xl object-cover"
                loading="lazy"
                src={getMediaUrl(salonImage)}
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
                <Building2 className="h-12 w-12 text-neutral-400" />
                <span className="sr-only">Salon image placeholder</span>
              </div>
            )}

            {/* Key details grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Role
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                  <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{getRoleLabel(job)}</span>
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Employment
                </p>
                <p className="mt-1 text-sm font-medium text-neutral-900">
                  {getEmploymentTypeLabel(job?.employmentType)}
                </p>
              </div>
              {job?.salary && (
                <div className="rounded-2xl bg-neutral-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Salary
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                    <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{job.salary}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {job?.description && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Description
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {job.description}
                </p>
              </div>
            )}

            {/* Requirements */}
            {job?.requirements && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Requirements
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {job.requirements}
                </p>
              </div>
            )}

            {/* Salon info */}
            <div className="rounded-2xl border border-neutral-200 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <BriefcaseBusiness className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{salon?.name || "Salon"}</span>
              </p>
              {salonLocation && (
                <p className="mt-2 flex items-start gap-2 text-sm text-neutral-500">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{salonLocation}</span>
                </p>
              )}
              {salon?.description && (
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {salon.description}
                </p>
              )}
            </div>

            {/* Contact */}
            <div className="rounded-2xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-700">Contact</p>
              {contactInfo ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
                  {contactInfo}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  No contact information provided. Please contact the salon
                  directly.
                </p>
              )}
            </div>

            {/* Contact actions */}
            {(phoneHref || canCopy) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {phoneHref && (
                  <Button as="a" href={phoneHref}>
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
              <p className="text-sm font-semibold text-neutral-500">
                {copyStatus}
              </p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-neutral-100 px-4 py-3 sm:px-6 sm:py-4">
          <Button
            className="w-full"
            disabled={isApplied}
            onClick={() => {
              onClose();
              if (onApply) onApply(job);
            }}
            type="button"
          >
            {isApplied ? "Applied" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
