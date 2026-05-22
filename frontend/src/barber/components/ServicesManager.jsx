import { useState } from "react";
import {
  Plus,
  Pencil,
  Settings,
  Trash2,
  X,
  Clock,
  Wallet,
  AlertCircle,
  Scissors,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  getServiceCategoryLabel,
  serviceCategories,
} from "@/shared/data/serviceCategories";

const emptyForm = {
  name: "",
  price: "",
  duration: "",
  description: "",
  category: "other",
  tags: "",
};

function formatPrice(price) {
  return Number(price).toLocaleString();
}

export default function ServicesManager({
  services,
  removeService,
  addService,
  updateService,
  isLoading = false,
  isSaving = false,
  error = "",
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const openAddModal = () => {
    setEditingService(null);
    setForm(emptyForm);
    setModalError("");
    setShowModal(true);
  };

  const openEditModal = (service) => {
    setEditingService(service);
    setForm({
      name: service.name || "",
      price: String(service.price ?? ""),
      duration: String(service.duration ?? ""),
      description: service.description || "",
      category: service.category || "other",
      tags: Array.isArray(service.tags) ? service.tags.join(", ") : "",
    });
    setModalError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingService(null);
    setForm(emptyForm);
    setModalError("");
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const price = Number(form.price);
    const duration = Number(form.duration);
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!name) {
      setModalError("Service name is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setModalError("Price must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setModalError("Duration must be a positive number.");
      return;
    }

    setModalError("");

    if (editingService) {
      try {
        await updateService(editingService.id, {
          name,
          price,
          duration,
          description: form.description.trim(),
          category: form.category,
          tags,
        });
        closeModal();
      } catch (err) {
        setModalError(
          err.response?.data?.message || "Could not update service."
        );
      }
    } else {
      await addService({
        name,
        price: Number(price),
        duration: Number(duration),
        description: form.description.trim(),
        category: form.category,
        tags,
      });
      closeModal();
    }
  };

  const handleDelete = async (serviceId) => {
    setDeleteConfirmId(null);
    await removeService(serviceId);
  };

  const handleToggleActive = async (service) => {
    await updateService(service.id, { active: !service.active });
  };

  return (
    <>
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-5 p-4 sm:p-6">
          {/* Header */}
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Settings className="h-6 w-6 text-neutral-700" />
              Ծառայություններ
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {services.length} service{services.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Global error */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <div className="mb-2 h-4 w-32 rounded-full bg-neutral-200" />
                  <div className="h-3 w-24 rounded-full bg-neutral-100" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && services.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200">
                <Scissors className="h-7 w-7 text-neutral-500" />
              </div>
              <div>
                <p className="text-lg font-semibold text-neutral-700">No services yet</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Add your first service to start accepting bookings.
                </p>
              </div>
              <Button
                onClick={openAddModal}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-5 py-2.5 font-medium"
              >
                <Plus className="mr-2 h-5 w-5" />
                Add your first service
              </Button>
            </div>
          )}

          {/* Service list */}
          {!isLoading && services.length > 0 && (
            <>
              {/* Add button above list */}
              <div className="flex sm:justify-end">
                <Button
                  onClick={openAddModal}
                  disabled={isSaving}
                  className="w-full sm:w-auto bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>
              </div>

              <div className="space-y-3">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                      !s.active ? "border-dashed border-neutral-300 bg-neutral-50/50" : "border-neutral-200"
                    }`}
                  >
                    {/* Active/inactive indicator bar */}
                    <div
                      className={`absolute left-0 top-0 h-full w-1 ${
                        s.active ? "bg-emerald-500" : "bg-neutral-300"
                      }`}
                    />

                    <div className="flex items-center justify-between gap-4 p-4 pl-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold ${
                              s.active ? "text-neutral-950" : "text-neutral-400"
                            }`}
                          >
                            {s.name}
                          </span>
                          {!s.active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                              <EyeOff className="h-3 w-3" />
                              Inactive
                            </span>
                          )}
                        </div>
                        <span className="mt-1 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                          {getServiceCategoryLabel(s.category || "other")}
                        </span>

                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                          <span className="inline-flex items-center gap-1 text-neutral-600">
                            <Clock className="h-3.5 w-3.5" />
                            {s.duration} min
                          </span>
                          <span className="inline-flex items-center gap-1 font-medium text-neutral-900">
                            <Wallet className="h-3.5 w-3.5" />
                            {formatPrice(s.price)} դր
                          </span>
                        </div>

                        {s.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400 line-clamp-2">
                            {s.description}
                          </p>
                        )}
                        {Array.isArray(s.tags) && s.tags.length > 0 && (
                          <p className="mt-1 text-xs text-neutral-400">
                            {s.tags.slice(0, 4).join(", ")}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          disabled={isSaving}
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-neutral-400 hover:text-amber-600"
                          title={s.active ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleActive(s)}
                        >
                          {s.active ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          disabled={isSaving}
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-neutral-400 hover:text-blue-600"
                          title="Edit"
                          onClick={() => openEditModal(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {deleteConfirmId === s.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-9 px-3 text-xs"
                              onClick={() => handleDelete(s.id)}
                            >
                              Delete
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 text-xs"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            disabled={isSaving}
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-neutral-400 hover:text-red-600"
                            title="Delete"
                            onClick={() => setDeleteConfirmId(s.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal backdrop */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md animate-in rounded-3xl bg-white p-6 shadow-2xl">
            {/* Modal header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                  {editingService ? (
                    <Pencil className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Plus className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {editingService
                      ? "Խմբագրել ծառայությունը"
                      : "Ավելացնել ծառայություն"}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {editingService
                      ? "Update the service details below"
                      : "Fill in the details for the new service"}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal error */}
            {modalError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal form */}
            <div className="space-y-4">
              <label className="grid gap-1.5 text-sm font-semibold">
                Service name
                <input
                  className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  placeholder="e.g. Haircut, Beard Trim"
                  disabled={isSaving}
                  value={form.name}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                  autoFocus
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold">
                  Price (դր)
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      դր
                    </span>
                    <input
                      className="w-full rounded-2xl border border-neutral-300 p-3 pl-10 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      placeholder="0"
                      type="number"
                      min="0"
                      disabled={isSaving}
                      value={form.price}
                      onChange={(e) =>
                        handleFieldChange("price", e.target.value)
                      }
                    />
                  </div>
                </label>

                <label className="grid gap-1.5 text-sm font-semibold">
                  Duration
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      min
                    </span>
                    <input
                      className="w-full rounded-2xl border border-neutral-300 p-3 pl-12 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      placeholder="30"
                      type="number"
                      min="1"
                      disabled={isSaving}
                      value={form.duration}
                      onChange={(e) =>
                        handleFieldChange("duration", e.target.value)
                      }
                    />
                  </div>
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold">
                Category
                <select
                  className="w-full rounded-2xl border border-neutral-300 bg-white p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  disabled={isSaving}
                  value={form.category}
                  onChange={(e) => handleFieldChange("category", e.target.value)}
                >
                  {serviceCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-semibold">
                Tags
                <span className="text-xs font-normal text-neutral-400">
                  Optional comma-separated search terms
                </span>
                <input
                  className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  placeholder="e.g. manicure, gel, bridal"
                  disabled={isSaving}
                  value={form.tags}
                  onChange={(e) => handleFieldChange("tags", e.target.value)}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold">
                Description
                <span className="text-xs font-normal text-neutral-400">
                  Optional — briefly describe what this service includes
                </span>
                <textarea
                  className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  placeholder="e.g. Includes wash, cut, and styling"
                  rows={3}
                  disabled={isSaving}
                  value={form.description}
                  onChange={(e) =>
                    handleFieldChange("description", e.target.value)
                  }
                />
              </label>

              {/* Preview */}
              {form.name && (form.price || form.duration) && (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Preview
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {form.name || "Service name"}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {form.duration || "?"} min ·{" "}
                        {form.price
                          ? `${formatPrice(form.price)} դր`
                          : "? դր"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal actions */}
              <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
                <Button
                  variant="ghost"
                  disabled={isSaving}
                  onClick={closeModal}
                >
                  Չեղարկել
                </Button>
                <Button disabled={isSaving} onClick={handleSave}>
                  {isSaving
                    ? "Saving..."
                    : editingService
                      ? "Պահպանել"
                      : "Ավելացնել"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
