import { useCallback, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

import JobsFiltersPanel from "@/features/jobs/components/JobsFiltersPanel";
import JobsGrid from "@/features/jobs/components/JobsGrid";
import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";

const ROLE_LABELS = {
  barber: "Barber",
  hairdresser: "Hairdresser",
  "nail-artist": "Nail artist",
  "makeup-artist": "Makeup artist",
  receptionist: "Receptionist",
  other: "Other",
};

function getJobsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  return [];
}

function getSubmissionJobId(application) {
  const job = application?.job;

  if (job?.id) return job.id;
  if (job?._id) return job._id;
  if (application?.jobId) return application.jobId;
  if (typeof job === "string") return job;

  return "";
}

export default function JobsPage() {
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [appliedJobIds, setAppliedJobIds] = useState(() => new Set());
  const [error, setError] = useState("");
  const currentUserId = currentUser?.id || currentUser?._id || "";

  // Read salonId from URL query params
  const salonId = searchParams.get("salonId") || "";

  const removeSalonFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("salonId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");

      try {
        const params = {};

        if (role) {
          params.role = role;
        }

        if (city.trim()) {
          params.city = city.trim();
        }

        if (salonId) {
          params.salonId = salonId;
        }

        const { data } = await api.get("/salon-jobs", { params });

        if (isMounted) {
          setJobs(getJobsFromResponse(data));
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message || "Could not load job posts."
          );
          setJobs([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [city, role, salonId]);

  useEffect(() => {
    let isMounted = true;

    const loadAppliedJobIds = async () => {
      if (!isAuthenticated || currentUser?.role !== "barber") {
        if (isMounted) {
          setAppliedJobIds(new Set());
        }
        return;
      }

      try {
        const { data } = await api.get("/salon-jobs/applications/my-submissions");
        const nextAppliedJobIds = new Set(
          (Array.isArray(data) ? data : [])
            .map(getSubmissionJobId)
            .filter(Boolean)
            .map(String)
        );

        if (isMounted) {
          setAppliedJobIds(nextAppliedJobIds);
        }
      } catch {
        if (isMounted) {
          setAppliedJobIds(new Set());
        }
      }
    };

    loadAppliedJobIds();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, currentUserId, isAuthenticated]);

  const hasActiveFilters = Boolean(role || city.trim() || salonId);
  const activeFiltersCount = [role, city.trim(), salonId].filter(Boolean).length;
  const filterChips = useMemo(() => {
    const chips = [];

    if (role) {
      chips.push({
        label: `Role: ${ROLE_LABELS[role] || role}`,
        onRemove: () => setRole(""),
      });
    }

    if (city.trim()) {
      chips.push({
        label: `City: ${city.trim()}`,
        onRemove: () => setCity(""),
      });
    }

    if (salonId) {
      chips.push({
        label: "Showing jobs for this salon",
        onRemove: removeSalonFilter,
      });
    }

    return chips;
  }, [city, role, salonId, removeSalonFilter]);

  const resetFilters = () => {
    setRole("");
    setCity("");
  };

  const markJobApplied = (jobId) => {
    if (!jobId) return;

    setAppliedJobIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(String(jobId));
      return nextIds;
    });
  };

  useEffect(() => {
    if (!isFiltersOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsFiltersOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFiltersOpen]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-200/60 sm:flex-row sm:items-center sm:justify-between sm:rounded-3xl sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Salon jobs
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Browse active openings from salons looking for new specialists.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => setIsFiltersOpen(true)}
          type="button"
          variant="outline"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
        </Button>
      </div>

      <main className="space-y-5 sm:space-y-6">
        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <JobsGrid
          appliedJobIds={appliedJobIds}
          currentUser={currentUser}
          hasActiveFilters={hasActiveFilters}
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
          jobs={jobs}
          onJobApplied={markJobApplied}
          onResetFilters={resetFilters}
        />
      </main>

      {isFiltersOpen && (
        <div
          aria-labelledby="jobs-filter-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
        >
          <button
            aria-label="Close filters"
            className="absolute inset-0"
            onClick={() => setIsFiltersOpen(false)}
            type="button"
          />
          <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-xl font-bold tracking-tight text-neutral-950"
                  id="jobs-filter-title"
                >
                  Filter jobs
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Narrow openings by role or city.
                </p>
              </div>
              <Button
                aria-label="Close filters"
                onClick={() => setIsFiltersOpen(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <JobsFiltersPanel
                city={city}
                className="border-0 p-0 shadow-none sm:p-0"
                filterChips={filterChips}
                onCityChange={setCity}
                onRoleChange={setRole}
                role={role}
                showIntro={false}
              />
            </div>

            <div className="mt-5 grid gap-2 border-t border-neutral-100 pt-4 sm:grid-cols-2">
              <Button
                disabled={!hasActiveFilters}
                onClick={resetFilters}
                type="button"
                variant="outline"
              >
                Clear filters
              </Button>
              <Button onClick={() => setIsFiltersOpen(false)} type="button">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
