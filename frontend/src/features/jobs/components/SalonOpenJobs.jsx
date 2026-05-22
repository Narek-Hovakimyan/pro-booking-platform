import { ExternalLink, Scissors, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";

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

export default function SalonOpenJobs({ jobs, isLoading, salonId }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Open jobs</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Loading job openings…
          </p>
        </div>
        <div className="grid gap-3">
          {[1, 2].map((item) => (
            <div
              className="h-28 animate-pulse rounded-2xl bg-neutral-100"
              key={item}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Open jobs</h2>
        <p className="mt-1 text-sm text-neutral-500">
          This salon is looking for new specialists.
        </p>
      </div>

      <div className="grid gap-3">
        {jobs.map((job) => {
          const jobId = job?.id || job?._id;

          return (
            <article
              className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:shadow-sm"
              key={jobId}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold text-neutral-950">
                    {job.title || "Untitled"}
                  </h3>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {getRoleLabel(job)}
                    </span>
                    <span>
                      {EMPLOYMENT_TYPE_LABELS[job.employmentType] ||
                        job.employmentType}
                    </span>
                    {job.salary && (
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {job.salary}
                      </span>
                    )}
                  </div>

                  {(job.description || job.requirements) && (
                    <p className="mt-2 line-clamp-2 text-sm text-neutral-700">
                      {job.description || job.requirements}
                    </p>
                  )}

                  {job.contactInfo && (
                    <p className="mt-1.5 text-sm text-neutral-500">
                      {job.contactInfo}
                    </p>
                  )}
                </div>

                <Link
                  className="shrink-0"
                  to={`/jobs?salonId=${salonId}`}
                >
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View details
                  </Button>
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Link
        className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700"
        to={`/jobs?salonId=${salonId}`}
      >
        View all jobs
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
