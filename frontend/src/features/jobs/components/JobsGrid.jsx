import {
  BriefcaseBusiness,
  Building2,
  MapPin,
  Phone,
  Scissors,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";

import { SalonCardSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";
import JobApplicationDialog from "./JobApplicationDialog";
import JobDetailDialog from "./JobDetailDialog";

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

function getJobId(job) {
  return job?.id || job?._id;
}

function getRoleLabel(job) {
  if (job?.role === "other" && job?.customRole) {
    return `Other: ${job.customRole}`;
  }

  return ROLE_LABELS[job?.role] || job?.role || "Role not specified";
}

function getEmploymentTypeLabel(employmentType) {
  return (
    EMPLOYMENT_TYPE_LABELS[employmentType] || employmentType || "Employment type not specified"
  );
}

function getPreview(job) {
  const text = job?.requirements || job?.description || "";

  if (text.length <= 180) {
    return text;
  }

  return `${text.slice(0, 177).trimEnd()}...`;
}

function getSalonLocation(salon) {
  return [salon?.city, salon?.address].filter(Boolean).join(", ");
}

export default function JobsGrid({
  appliedJobIds = [],
  currentUser = null,
  jobs = [],
  isLoading = false,
  isAuthenticated = false,
  hasActiveFilters = false,
  onJobApplied,
  onResetFilters,
}) {
  const [detailJob, setDetailJob] = useState(null);
  const [applyJob, setApplyJob] = useState(null);
  const initialLoading = isLoading && jobs.length === 0;
  const appliedJobIdSet = useMemo(
    () => new Set(Array.from(appliedJobIds).map(String)),
    [appliedJobIds]
  );

  if (initialLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <SalonCardSkeleton key={item} />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        actionLabel={hasActiveFilters ? "Clear filters" : ""}
        description={
          hasActiveFilters
            ? "Try changing the selected role or city."
            : "No job posts found"
        }
        onAction={onResetFilters}
        title="No job posts found"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {jobs.map((job) => {
        const jobId = getJobId(job);
        const preview = getPreview(job);
        const salon = job?.salon || {};
        const salonLocation = getSalonLocation(salon);
        const salonImage = salon?.imageUrl || salon?.image || "";
        const hasApplied = appliedJobIdSet.has(String(jobId));

        return (
          <Card
            className="rounded-2xl transition-shadow hover:shadow-md sm:rounded-3xl"
            key={jobId}
          >
            <CardContent className="space-y-4 p-4 sm:p-6">
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

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
                    {getEmploymentTypeLabel(job?.employmentType)}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-neutral-950">{job?.title || "Untitled job"}</h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{getRoleLabel(job)}</span>
                  </p>
                  {job?.salary && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                      <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{job.salary}</span>
                    </p>
                  )}
                </div>
              </div>

              {preview && (
                <p className="text-sm leading-6 text-neutral-600">{preview}</p>
              )}

              {job?.contactInfo && (
                <div className="rounded-2xl bg-neutral-50 p-3">
                  <p className="flex items-start gap-2 text-sm text-neutral-600">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{job.contactInfo}</span>
                  </p>
                </div>
              )}

              <div className="space-y-1 rounded-2xl border border-neutral-200 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <BriefcaseBusiness className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{salon?.name || "Salon"}</span>
                </p>
                {salonLocation && (
                  <p className="flex items-start gap-2 text-sm text-neutral-500">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{salonLocation}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setDetailJob(job)}
                  type="button"
                  variant="outline"
                >
                  View details
                </Button>
                <Button
                  disabled={hasApplied}
                  onClick={() => setApplyJob(job)}
                  type="button"
                >
                  {hasApplied ? "Applied" : "Apply"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {detailJob && (
        <JobDetailDialog
          isApplied={appliedJobIdSet.has(String(getJobId(detailJob)))}
          job={detailJob}
          onClose={() => setDetailJob(null)}
          onApply={(j) => {
            setDetailJob(null);
            setApplyJob(j);
          }}
        />
      )}

      {applyJob && (
        <JobApplicationDialog
          currentUser={currentUser}
          isAuthenticated={isAuthenticated}
          key={getJobId(applyJob)}
          job={applyJob}
          onApplied={onJobApplied}
          onClose={() => setApplyJob(null)}
        />
      )}
    </div>
  );
}
