import {
  CalendarDays,
  MapPin,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "@/shared/api/axios";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800",
  reviewed: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

function getJobId(job) {
  return job?.id || job?._id || "";
}

function getApplicationId(application) {
  return application?.id || application?._id || "";
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export default function JobApplicationsDialog({ job, onClose }) {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingApplicationId, setUpdatingApplicationId] = useState("");
  const jobId = getJobId(job);

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

  useEffect(() => {
    let isMounted = true;

    const loadApplications = async () => {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get(`/salon-jobs/${jobId}/applications`);

        if (isMounted) {
          setApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load applications."
          );
          setApplications([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (jobId) {
      loadApplications();
    }

    return () => {
      isMounted = false;
    };
  }, [jobId]);

  const applicationCountLabel = useMemo(() => {
    if (isLoading) return "";
    return `${applications.length} application${applications.length === 1 ? "" : "s"}`;
  }, [applications.length, isLoading]);

  if (!job) return null;

  const updateStatus = async (application, status) => {
    const applicationId = getApplicationId(application);

    if (!applicationId || status === application.status) return;

    setUpdatingApplicationId(applicationId);
    setError("");

    try {
      const { data } = await api.patch(
        `/salon-jobs/applications/${applicationId}/status`,
        { status }
      );

      setApplications((currentApplications) =>
        currentApplications.map((currentApplication) =>
          getApplicationId(currentApplication) === applicationId
            ? data
            : currentApplication
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update application status."
      );
    } finally {
      setUpdatingApplicationId("");
    }
  };

  return (
    <div
      aria-labelledby="job-applications-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close applications"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0">
            <h2
              className="text-xl font-bold tracking-tight text-neutral-950"
              id="job-applications-title"
            >
              Applications
            </h2>
            <p className="mt-1 break-words text-sm text-neutral-500">
              {job.title || "Untitled job"}
              {applicationCountLabel ? ` · ${applicationCountLabel}` : ""}
            </p>
          </div>
          <Button
            aria-label="Close applications"
            onClick={onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {error && (
            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => (
                <div
                  className="h-36 animate-pulse rounded-2xl bg-neutral-100"
                  key={item}
                />
              ))}
            </div>
          ) : applications.length === 0 ? (
            <EmptyState title="No applications yet" />
          ) : (
            <div className="grid gap-3">
              {applications.map((application) => {
                const applicant = application.applicant || {};
                const applicationId = getApplicationId(application);
                const isUpdating = updatingApplicationId === applicationId;
                const submittedDate = formatDate(application.createdAt);

                return (
                  <article
                    className="rounded-2xl border border-neutral-200 p-4"
                    key={applicationId}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          {applicant.avatarUrl ? (
                            <img
                              alt={applicant.name || "Applicant"}
                              className="h-12 w-12 shrink-0 rounded-full object-cover"
                              src={getMediaUrl(applicant.avatarUrl)}
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                              <UserRound
                                aria-hidden="true"
                                className="h-5 w-5 text-neutral-500"
                              />
                            </div>
                          )}

                          <div className="min-w-0">
                            <h3 className="break-words text-base font-semibold text-neutral-950">
                              {applicant.name || "Applicant"}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                              {applicant.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  {applicant.phone}
                                </span>
                              )}
                              {applicant.city && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  {applicant.city}
                                </span>
                              )}
                              {submittedDate && (
                                <span className="flex items-center gap-1.5">
                                  <CalendarDays
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  {submittedDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                              Message
                            </p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
                              {application.message || "No message provided."}
                            </p>
                          </div>

                          {application.experience && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                Experience
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
                                {application.experience}
                              </p>
                            </div>
                          )}

                          {application.contactInfo && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                Contact info
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
                                {application.contactInfo}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 lg:w-44">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${
                            STATUS_STYLES[application.status] ||
                            "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {getStatusLabel(application.status)}
                        </span>
                        <label className="grid gap-1 text-sm font-medium text-neutral-700">
                          Status
                          <select
                            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                            disabled={isUpdating}
                            onChange={(event) =>
                              updateStatus(application, event.target.value)
                            }
                            value={application.status}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
