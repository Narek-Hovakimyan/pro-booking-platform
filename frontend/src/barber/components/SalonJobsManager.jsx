import {
  BriefcaseBusiness,
  ClipboardList,
  Pencil,
  Plus,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import JobApplicationsDialog from "@/features/jobs/components/JobApplicationsDialog";
import api from "@/shared/api/axios";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const ROLE_OPTIONS = [
  { value: "barber", label: "Barber" },
  { value: "hairdresser", label: "Hairdresser" },
  { value: "nail-artist", label: "Nail artist" },
  { value: "makeup-artist", label: "Makeup artist" },
  { value: "receptionist", label: "Receptionist" },
  { value: "other", label: "Other" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "commission", label: "Commission" },
  { value: "rent-chair", label: "Rent chair" },
];

const emptyForm = {
  salonId: "",
  title: "",
  role: "barber",
  customRole: "",
  employmentType: "full-time",
  salary: "",
  requirements: "",
  description: "",
  contactInfo: "",
};

const getId = (value) => value?.id || value?._id || "";

const getRoleLabel = (role) =>
  ROLE_OPTIONS.find((option) => option.value === role)?.label || role;

const getEmploymentTypeLabel = (employmentType) =>
  EMPLOYMENT_TYPE_OPTIONS.find((option) => option.value === employmentType)?.label ||
  employmentType;

export default function SalonJobsManager() {
  const [jobs, setJobs] = useState([]);
  const [salons, setSalons] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingJob, setEditingJob] = useState(null);
  const [applicationsJob, setApplicationsJob] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort(
        (left, right) =>
          new Date(right.createdAt || 0).getTime() -
          new Date(left.createdAt || 0).getTime()
      ),
    [jobs]
  );

  const loadJobs = async () => {
    const { data } = await api.get("/salon-jobs/mine");
    setJobs(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError("");

      try {
        const [jobsResponse, statusResponse] = await Promise.all([
          api.get("/salon-jobs/mine"),
          api.get("/salons/me/status"),
        ]);

        if (!isMounted) return;

        setJobs(Array.isArray(jobsResponse.data) ? jobsResponse.data : []);
        setSalons(statusResponse.data?.managedSalons || []);
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salon job posts."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      salonId: salons.length === 1 ? getId(salons[0]) : "",
    });
    setEditingJob(null);
    setFormError("");
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (job) => {
    const jobSalonId = job.salon?.id || job.salon?._id || "";

    setEditingJob(job);
    setForm({
      salonId: jobSalonId,
      title: job.title || "",
      role: job.role || "barber",
      customRole: job.customRole || "",
      employmentType: job.employmentType || "full-time",
      salary: job.salary || "",
      requirements: job.requirements || "",
      description: job.description || "",
      contactInfo: job.contactInfo || "",
    });
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const updateFormField = (field, value) => {
    setFormError("");
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!editingJob && !form.salonId) {
      setFormError("Choose a salon.");
      return;
    }

    if (!form.title.trim()) {
      setFormError("Add a title.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const payload = {
        title: form.title.trim(),
        role: form.role,
        customRole: form.customRole.trim(),
        employmentType: form.employmentType,
        salary: form.salary.trim(),
        requirements: form.requirements.trim(),
        description: form.description.trim(),
        contactInfo: form.contactInfo.trim(),
      };

      if (editingJob) {
        await api.put(`/salon-jobs/${editingJob.id}`, payload);
      } else {
        await api.post("/salon-jobs", {
          ...payload,
          salonId: form.salonId,
        });
      }

      await loadJobs();
      closeForm();
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.message ||
          "Could not save salon job post."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const closeJob = async (job) => {
    if (job.status === "closed") return;
    if (!window.confirm(`Close "${job.title}"?`)) return;

    setIsSaving(true);
    setError("");

    try {
      await api.patch(`/salon-jobs/${job.id}/close`);
      await loadJobs();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not close salon job post."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="lg:col-span-3">
      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-neutral-950">
                <BriefcaseBusiness className="h-5 w-5" />
                Salon jobs
              </h2>
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={isLoading || salons.length === 0}
              onClick={openCreateForm}
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" />
              New job
            </Button>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {salons.length === 0 && !isLoading && (
            <EmptyState
              description="Only salon owners and admins can manage job posts."
              title="No managed salons"
            />
          )}

          {isFormOpen && (
            <form
              className="grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Salon
                  <select
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={Boolean(editingJob) || isSaving}
                    onChange={(event) => updateFormField("salonId", event.target.value)}
                    value={form.salonId}
                  >
                    <option value="">Select salon</option>
                    {salons.map((salon) => (
                      <option key={getId(salon)} value={getId(salon)}>
                        {salon.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Title
                  <input
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={isSaving}
                    onChange={(event) => updateFormField("title", event.target.value)}
                    value={form.title}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Role
                  <select
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={isSaving}
                    onChange={(event) => updateFormField("role", event.target.value)}
                    value={form.role}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Custom role
                  <input
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={isSaving}
                    onChange={(event) => updateFormField("customRole", event.target.value)}
                    value={form.customRole}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Employment type
                  <select
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={isSaving}
                    onChange={(event) =>
                      updateFormField("employmentType", event.target.value)
                    }
                    value={form.employmentType}
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-neutral-700">
                  Salary
                  <input
                    className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                    disabled={isSaving}
                    onChange={(event) => updateFormField("salary", event.target.value)}
                    value={form.salary}
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Requirements
                <textarea
                  className="min-h-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950"
                  disabled={isSaving}
                  onChange={(event) => updateFormField("requirements", event.target.value)}
                  value={form.requirements}
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Description
                <textarea
                  className="min-h-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950"
                  disabled={isSaving}
                  onChange={(event) => updateFormField("description", event.target.value)}
                  value={form.description}
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-neutral-700">
                Contact info
                <input
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                  disabled={isSaving}
                  onChange={(event) => updateFormField("contactInfo", event.target.value)}
                  value={form.contactInfo}
                />
              </label>

              {formError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  disabled={isSaving}
                  onClick={closeForm}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={isSaving} type="submit">
                  {editingJob ? "Save changes" : "Create job"}
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => (
                <div
                  className="h-28 animate-pulse rounded-2xl bg-neutral-100"
                  key={item}
                />
              ))}
            </div>
          ) : sortedJobs.length === 0 && salons.length > 0 ? (
            <EmptyState
              actionLabel="Create job"
              onAction={openCreateForm}
              title="No job posts"
            />
          ) : (
            <div className="grid gap-3">
              {sortedJobs.map((job) => (
                <article
                  className="rounded-2xl border border-neutral-200 p-4"
                  key={job.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-semibold text-neutral-950">
                          {job.title}
                        </h3>
                        <span
                          className={
                            job.status === "active"
                              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                              : "rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600"
                          }
                        >
                          {job.status === "active" ? "Active" : "Closed"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-600">
                        <span>{job.salon?.name || "Salon"}</span>
                        <span>{getRoleLabel(job.role)}</span>
                        <span>{getEmploymentTypeLabel(job.employmentType)}</span>
                        {job.salary && <span>{job.salary}</span>}
                      </div>
                      {job.description && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-700">
                          {job.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        disabled={isSaving}
                        onClick={() => setApplicationsJob(job)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Applications
                      </Button>
                      <Button
                        disabled={isSaving}
                        onClick={() => openEditForm(job)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      {job.status === "active" && (
                        <Button
                          disabled={isSaving}
                          onClick={() => closeJob(job)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Close
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {applicationsJob && (
        <JobApplicationsDialog
          job={applicationsJob}
          onClose={() => setApplicationsJob(null)}
        />
      )}
    </div>
  );
}
