import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
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
import { fetchServiceCategories } from "@/shared/api/serviceCategories";
import ServiceCategoryManager from "./ServiceCategoryManager";

const emptyForm = {
  name: "",
  price: "",
  duration: "",
  description: "",
  category: "other",
  tags: "",
  type: "single",
  includedServiceIds: [],
  packagePriceMode: "manual",
  packageDurationMode: "manual",
  categoryType: "system",
  customCategoryId: "",
};

function formatPrice(price) {
  return Number(price).toLocaleString();
}

/**
 * Look up the display name for a custom category from a loaded list.
 * If customCategoryId is a populated object with .name, returns it directly.
 */
function getCustomCategoryName(customCategories, customCategoryId) {
  if (!customCategoryId) return null;
  // Populated object from backend
  if (typeof customCategoryId === "object" && customCategoryId.name) {
    return customCategoryId.name;
  }
  // Raw string — look up from loaded list
  if (!Array.isArray(customCategories)) return null;
  const id =
    typeof customCategoryId === "object"
      ? String(customCategoryId._id || customCategoryId.id)
      : String(customCategoryId);
  const cat = customCategories.find(
    (c) => String(c._id || c.id) === id
  );
  return cat?.name || null;
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
  const { currentUser } = useSelector((state) => state.auth);
  const barberId = currentUser?.id || currentUser?._id;

  /* ── Custom categories state (for card labels after navigation) ── */
  const [customCategories, setCustomCategories] = useState([]);

  /* ── Load custom categories on mount ── */
  useEffect(() => {
    if (!barberId) return;
    let cancelled = false;
    fetchServiceCategories(barberId)
      .then((cats) => {
        if (!cancelled) {
          setCustomCategories(Array.isArray(cats) ? cats.filter((c) => c.source === "custom") : []);
        }
      })
      .catch(() => {
        // Silently fail — custom categories not critical for page load
      });
    return () => { cancelled = true; };
  }, [barberId]);

  /* ── Modal state ── */
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");

  /* ── Delete confirmation ── */
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  /* ── Derived: is package with sum mode? ── */
  const isPackageSumPrice =
    form.type === "package" && form.packagePriceMode === "sum";
  const isPackageSumDuration =
    form.type === "package" && form.packageDurationMode === "sum";

  /* ── Available services for package inclusion ── */
  const availablePackageServices = services.filter(
    (service) =>
      service.active &&
      service.type !== "package" &&
      (!editingService || String(service.id) !== String(editingService.id))
  );

  /* ── Modal open/close ── */
  const openAddModal = () => {
    setEditingService(null);
    setForm(emptyForm);
    setModalError("");
    setShowModal(true);
  };

  const openEditModal = (service) => {
    // Extract ID whether customCategoryId is a populated object or a raw string
    const customCategoryIdVal = service.customCategoryId;
    const hasCustomCategory = Boolean(customCategoryIdVal);
    const customCategoryIdStr = hasCustomCategory
      ? typeof customCategoryIdVal === "object"
        ? String(customCategoryIdVal._id || customCategoryIdVal.id)
        : String(customCategoryIdVal)
      : "";

    setEditingService(service);
    setForm({
      name: service.name || "",
      price: String(service.price ?? ""),
      duration: String(service.duration ?? ""),
      description: service.description || "",
      category: service.category || "other",
      tags: Array.isArray(service.tags) ? service.tags.join(", ") : "",
      type: service.type || "single",
      includedServiceIds: (service.includedServiceIds || []).map((id) =>
        typeof id === "object" ? String(id._id || id) : String(id)
      ),
      packagePriceMode: service.packagePriceMode || "manual",
      packageDurationMode: service.packageDurationMode || "manual",
      categoryType: hasCustomCategory ? "custom" : "system",
      customCategoryId: customCategoryIdStr,
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

  /* ── Save service ── */
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

    // Price: required for single; for package, only required when manual mode
    if (!isPackageSumPrice) {
      if (!Number.isFinite(price) || price < 0) {
        setModalError("Price must be a non-negative number.");
        return;
      }
    }

    // Duration: required for single; for package, only required when manual mode
    if (!isPackageSumDuration) {
      if (!Number.isFinite(duration) || duration <= 0) {
        setModalError("Duration must be a positive number.");
        return;
      }
    }

    // Require selected category when custom mode is active
    if (form.categoryType === "custom" && !form.customCategoryId) {
      setModalError("Please select a custom category or add a new one.");
      return;
    }

    setModalError("");

    // Build payload — omit price/duration when auto-calculated via sum mode
    const basePayload = {
      name,
      description: form.description.trim(),
      tags,
      type: form.type,
    };

    if (!isPackageSumPrice) {
      basePayload.price = price;
    }
    if (!isPackageSumDuration) {
      basePayload.duration = duration;
    }

    // Add package fields
    if (form.type === "package") {
      basePayload.includedServiceIds = form.includedServiceIds;
      basePayload.packagePriceMode = form.packagePriceMode;
      basePayload.packageDurationMode = form.packageDurationMode;
    }

    if (form.categoryType === "custom") {
      basePayload.category = "other"; // backward-compatible fallback
      basePayload.customCategoryId = form.customCategoryId || null;
    } else {
      basePayload.category = form.category;
      basePayload.customCategoryId = null; // explicitly clear
    }

    if (editingService) {
      try {
        await updateService(editingService.id, basePayload);
        closeModal();
      } catch (err) {
        setModalError(
          err.response?.data?.message || "Could not update service."
        );
      }
    } else {
      try {
        await addService(basePayload);
        closeModal();
      } catch (err) {
        setModalError(
          err.response?.data?.message || "Could not create service."
        );
      }
    }
  };

  const handleDelete = async (serviceId) => {
    setDeleteConfirmId(null);
    await removeService(serviceId);
  };

  const handleToggleActive = async (service) => {
    await updateService(service.id, { active: !service.active });
  };

  /* ── Category display helper for cards ── */
  const renderCategoryLabel = (service) => {
    if (service.customCategoryId) {
      // If customCategoryId is a populated object, use name directly
      if (typeof service.customCategoryId === "object" && service.customCategoryId.name) {
        return (
          <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
            {service.customCategoryId.name}
          </span>
        );
      }
      // Try to resolve from loaded custom categories
      const customName = getCustomCategoryName(
        customCategories,
        service.customCategoryId
      );
      if (customName) {
        return (
          <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
            {customName}
          </span>
        );
      }
      // customCategoryId exists but not yet resolved — show safe placeholder
      return (
        <span className="mt-1 inline-flex rounded-full bg-indigo-100/50 px-2 py-0.5 text-xs font-medium text-indigo-400">
          Custom
        </span>
      );
    }
    // No custom category — show system label
    return (
      <span className="mt-1 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
        {getServiceCategoryLabel(service.category || "other")}
      </span>
    );
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
                <p className="text-lg font-semibold text-neutral-700">
                  No services yet
                </p>
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
                      !s.active
                        ? "border-dashed border-neutral-300 bg-neutral-50/50"
                        : "border-neutral-200"
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
                              s.active
                                ? "text-neutral-950"
                                : "text-neutral-400"
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

                        {renderCategoryLabel(s)}

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
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col animate-in rounded-3xl bg-white shadow-2xl">
            {/* Modal header — sticky top */}
            <div className="flex items-center justify-between border-b border-neutral-100 p-6 pb-4">
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

            {/* Modal body — scrollable */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {/* Modal error */}
              {modalError && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Service name */}
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

                {/* ── Service type toggle ── */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Service type
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      handleFieldChange("type", "single");
                      handleFieldChange("includedServiceIds", []);
                      handleFieldChange("packagePriceMode", "manual");
                      handleFieldChange("packageDurationMode", "manual");
                    }}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                      form.type === "single"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    Single service
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleFieldChange("type", "package")}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                      form.type === "package"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    Package
                  </button>
                </div>

                {/* ── Price & Duration ── */}
                {/* For package services, show computed hint when sum mode */}
                {form.type === "package" ? (
                  <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                      Package pricing & duration
                    </p>
                    <p className="text-xs text-neutral-500">
                      Configure how the package total price and duration are
                      determined. When "Sum" is selected, values are
                      auto-calculated from included services.
                    </p>

                    {/* Included services multi-select */}
                    <label className="grid gap-1.5 text-sm font-semibold">
                      Included services
                      <span className="text-xs font-normal text-neutral-400">
                        Select at least 2 active single services
                      </span>
                      <div className="max-h-40 overflow-y-auto rounded-2xl border border-violet-200 bg-white p-1">
                        {availablePackageServices.map((s) => {
                          const isSelected = form.includedServiceIds.some(
                            (id) => String(id) === String(s.id)
                          );
                          return (
                            <label
                              key={s.id}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                                isSelected
                                  ? "bg-violet-100 text-violet-800"
                                  : "hover:bg-neutral-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                                checked={isSelected}
                                disabled={isSaving}
                                onChange={() => {
                                  const current = [
                                    ...form.includedServiceIds,
                                  ];
                                  if (isSelected) {
                                    handleFieldChange(
                                      "includedServiceIds",
                                      current.filter(
                                        (id) => String(id) !== String(s.id)
                                      )
                                    );
                                  } else {
                                    handleFieldChange("includedServiceIds", [
                                      ...current,
                                      s.id,
                                    ]);
                                  }
                                }}
                              />
                              <span className="flex-1">{s.name}</span>
                              <span className="text-xs text-neutral-400">
                                {s.duration}min · {formatPrice(s.price)}դր
                              </span>
                            </label>
                          );
                        })}
                        {availablePackageServices.length === 0 && (
                          <p className="p-3 text-center text-xs text-neutral-400">
                            No active single services available
                          </p>
                        )}
                      </div>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Price mode */}
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Price mode
                        <select
                          className="w-full rounded-2xl border border-violet-200 bg-white p-3 font-normal transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          disabled={isSaving}
                          value={form.packagePriceMode}
                          onChange={(e) =>
                            handleFieldChange(
                              "packagePriceMode",
                              e.target.value
                            )
                          }
                        >
                          <option value="manual">
                            Manual — set price yourself
                          </option>
                          <option value="sum">
                            Sum — auto-calculate from included services
                          </option>
                        </select>
                      </label>

                      {/* Duration mode */}
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Duration mode
                        <select
                          className="w-full rounded-2xl border border-violet-200 bg-white p-3 font-normal transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          disabled={isSaving}
                          value={form.packageDurationMode}
                          onChange={(e) =>
                            handleFieldChange(
                              "packageDurationMode",
                              e.target.value
                            )
                          }
                        >
                          <option value="manual">
                            Manual — set duration yourself
                          </option>
                          <option value="sum">
                            Sum — auto-calculate from included services
                          </option>
                        </select>
                      </label>
                    </div>

                    {/* Manual price/duration for package */}
                    {form.packagePriceMode === "manual" && (
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Package price (դր)
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
                    )}
                    {form.packageDurationMode === "manual" && (
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Package duration (min)
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
                    )}

                    {/* Computed totals hint */}
                    {isPackageSumPrice &&
                      form.includedServiceIds.length > 0 && (
                        <div className="rounded-xl bg-violet-100 p-3 text-sm text-violet-800">
                          <span className="font-medium">Computed price:</span>{" "}
                          {formatPrice(
                            services
                              .filter((s) =>
                                form.includedServiceIds.some(
                                  (id) => String(id) === String(s.id)
                                )
                              )
                              .reduce((sum, s) => sum + (s.price || 0), 0)
                          )}{" "}
                          դր
                        </div>
                      )}
                    {isPackageSumDuration &&
                      form.includedServiceIds.length > 0 && (
                        <div className="rounded-xl bg-violet-100 p-3 text-sm text-violet-800">
                          <span className="font-medium">
                            Computed duration:
                          </span>{" "}
                          {services
                            .filter((s) =>
                              form.includedServiceIds.some(
                                (id) => String(id) === String(s.id)
                              )
                            )
                            .reduce((sum, s) => sum + (s.duration || 0), 0)}{" "}
                          min
                        </div>
                      )}
                  </div>
                ) : (
                  /* ── Single service: price & duration side by side ── */
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
                )}

                {/* ── Category type toggle ── */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Category type
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleFieldChange("categoryType", "system")}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                      form.categoryType === "system"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    System category
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleFieldChange("categoryType", "custom")}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                      form.categoryType === "custom"
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    Custom category
                  </button>
                </div>

                {/* ── System category dropdown ── */}
                {form.categoryType === "system" && (
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Category
                    <select
                      className="w-full rounded-2xl border border-neutral-300 bg-white p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      disabled={isSaving}
                      value={form.category}
                      onChange={(e) =>
                        handleFieldChange("category", e.target.value)
                      }
                    >
                      {serviceCategories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* ── Custom category dropdown (managed by child) ── */}
                <ServiceCategoryManager
                  barberId={barberId}
                  form={form}
                  isSaving={isSaving}
                  onCustomCategoriesChange={setCustomCategories}
                  onCustomCategoryIdChange={(id) =>
                    handleFieldChange("customCategoryId", id)
                  }
                />

                {/* ── Tags ── */}
                <label className="grid gap-1 text-sm font-semibold">
                  Tags
                  <span className="text-xs font-normal text-neutral-400">
                    Optional comma-separated search terms
                  </span>
                  <input
                    className="w-full rounded-2xl border border-neutral-300 p-2.5 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    placeholder="e.g. manicure, gel, bridal"
                    disabled={isSaving}
                    value={form.tags}
                    onChange={(e) => handleFieldChange("tags", e.target.value)}
                  />
                </label>

                {/* ── Description ── */}
                <label className="grid gap-1 text-sm font-semibold">
                  Description
                  <span className="text-xs font-normal text-neutral-400">
                    Optional — briefly describe what this service includes
                  </span>
                  <textarea
                    className="w-full rounded-2xl border border-neutral-300 p-2.5 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    placeholder="e.g. Includes wash, cut, and styling"
                    rows={2}
                    disabled={isSaving}
                    value={form.description}
                    onChange={(e) =>
                      handleFieldChange("description", e.target.value)
                    }
                  />
                </label>
              </div>
            </div>

            {/* Modal footer — sticky bottom */}
            <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
              <Button
                variant="ghost"
                disabled={isSaving}
                onClick={closeModal}
              >
                Չեղարկել
              </Button>
              <Button
                disabled={
                  isSaving ||
                  (form.categoryType === "custom" && !form.customCategoryId)
                }
                onClick={handleSave}
              >
                {isSaving
                  ? "Saving..."
                  : editingService
                    ? "Պահպանել"
                    : "Ավելացնել"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
