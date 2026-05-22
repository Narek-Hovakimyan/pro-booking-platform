import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Calendar,
  Clock,
  MapPin,
  Scissors,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import EmptyState from "@/shared/components/common/EmptyState";
import api from "@/shared/api/axios";

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    icon: Clock,
  },
  reviewed: {
    label: "Reviewed",
    className:
      "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    icon: CheckCircle2,
  },
  accepted: {
    label: "Accepted",
    className:
      "bg-green-50 text-green-700 border-green-200",
    dotClass: "bg-green-500",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className:
      "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    icon: XCircle,
  },
};

const ROLE_LABELS = {
  barber: "Barber",
  hairdresser: "Hairdresser",
  "nail-artist": "Nail artist",
  "makeup-artist": "Makeup artist",
  receptionist: "Receptionist",
  other: "Other",
};

function getRoleLabel(job) {
  if (job?.role === "other" && job?.customRole) {
    return `Other: ${job.customRole}`;
  }
  return ROLE_LABELS[job?.role] || job?.role || "Role not specified";
}

function getSalonLocation(salon) {
  return [salon?.city, salon?.address].filter(Boolean).join(", ");
}

function formatDate(dateString) {
  if (!dateString) return "";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export default function MyJobApplicationsPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchApplications() {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/salon-jobs/applications/my-submissions");
        if (isMounted) {
          setApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message || "Could not load your applications."
          );
          setApplications([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchApplications();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleBrowseJobs = useCallback(() => {
    navigate("/jobs");
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-neutral-100" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-neutral-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card className="rounded-2xl sm:rounded-3xl" key={item}>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="h-5 w-24 animate-pulse rounded-full bg-neutral-100" />
                <div className="space-y-2">
                  <div className="h-6 w-3/4 animate-pulse rounded-lg bg-neutral-100" />
                  <div className="h-4 w-1/2 animate-pulse rounded-lg bg-neutral-100" />
                </div>
                <div className="h-4 w-full animate-pulse rounded-lg bg-neutral-100" />
                <div className="h-4 w-2/3 animate-pulse rounded-lg bg-neutral-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            My Applications
          </h1>
        </div>
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
        <Button onClick={handleBrowseJobs} type="button" variant="outline">
          Browse jobs
        </Button>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            My Applications
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track the status of your job applications.
          </p>
        </div>
        <EmptyState
          actionLabel="Browse jobs"
          description="You have not applied to any jobs yet."
          onAction={handleBrowseJobs}
          title="No applications yet"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
          My Applications
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Track the status of your job applications.
        </p>
      </div>

      {/* Application cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {applications.map((app) => {
          const job = app?.job || {};
          const salon = app?.salon || {};
          const salonLocation = getSalonLocation(salon);
          const statusKey = app?.status || "pending";
          const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;
          const StatusIcon = statusConfig.icon;
          const decisionDate =
            statusKey === "accepted"
              ? app.acceptedAt
              : statusKey === "rejected"
                ? app.rejectedAt
                : statusKey === "reviewed"
                  ? app.reviewedAt
                  : null;

          return (
            <Card
              className="rounded-2xl transition-shadow hover:shadow-md sm:rounded-3xl"
              key={app.id || app._id}
            >
              <CardContent className="space-y-4 p-4 sm:p-6">
                {/* Status badge */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusConfig.className}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5" />
                    {statusConfig.label}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(app.createdAt)}
                  </span>
                </div>

                {/* Job title + role */}
                <div>
                  <h2 className="text-xl font-bold text-neutral-950">
                    {job?.title || "Job"}
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{getRoleLabel(job)}</span>
                  </p>
                </div>

                {/* Salon info */}
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

                {/* Message preview */}
                {app?.message && (
                  <p className="text-sm leading-6 text-neutral-600 line-clamp-2">
                    {app.message}
                  </p>
                )}

                {/* Experience */}
                {app?.experience && (
                  <p className="text-sm text-neutral-500">
                    <span className="font-medium text-neutral-700">Experience:</span>{" "}
                    {app.experience}
                  </p>
                )}

                {/* Decision timestamp */}
                {decisionDate && (
                  <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <Clock className="h-3 w-3" />
                    {statusConfig.label}: {formatDate(decisionDate)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Browse more jobs */}
      <div className="flex justify-center">
        <Button onClick={handleBrowseJobs} type="button" variant="outline">
          Browse more jobs
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
