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
  CheckCircle2,
  Tag,
} from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  getServicePriceInfo,
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
  discountType: "none",
  discountValue: "0",
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
  fullPage = false,
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
  const selectedPackageServices = services.filter((service) =>
    form.includedServiceIds.some((id) => String(id) === String(service.id))
  );
  const computedPackagePrice = selectedPackageServices.reduce(
    (sum, service) => sum + Number(service.price || 0),
    0
  );
  const formOriginalPrice = isPackageSumPrice
    ? computedPackagePrice
    : Number(form.price);

  /* ── Available services for package inclusion ── */
  const availablePackageServices = services.filter(
    (service) =>
      service.active &&
      service.type !== "package" &&
      (!editingService || String(service.id) !== String(editingService.id))
  );
  const activeServices = services.filter((service) => service.active);
  const inactiveServices = services.filter((service) => !service.active);

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
      discountType: service.discountType || "none",
      discountValue: String(service.discountValue ?? 0),
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
    setForm((prev) => {
      if (field === "discountType" && value === "none") {
        return { ...prev, discountType: value, discountValue: "0" };
      }
      return { ...prev, [field]: value };
    });
  };

  /* ── Save service ── */
  const handleSave = async () => {
    const name = form.name.trim();
    const price = Number(form.price);
    const duration = Number(form.duration);
    const discountType = form.discountType || "none";
    const discountValue =
      discountType === "none" ? 0 : Number(form.discountValue);
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

    if (!["none", "percent", "fixed"].includes(discountType)) {
      setModalError("Please choose a valid discount type.");
      return;
    }

    if (discountType === "percent") {
      if (
        !Number.isFinite(discountValue) ||
        discountValue < 1 ||
        discountValue > 100
      ) {
        setModalError("Percent discount must be between 1 and 100.");
        return;
      }
    }

    if (discountType === "fixed") {
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        setModalError("Fixed discount must be greater than 0.");
        return;
      }
      if (!Number.isFinite(formOriginalPrice) || formOriginalPrice < 0) {
        setModalError("Enter the service price before adding a fixed discount.");
        return;
      }
      if (discountValue > formOriginalPrice) {
        setModalError("Fixed discount cannot exceed the original price.");
        return;
      }
    }

    setModalError("");

    // Build payload — omit price/duration when auto-calculated via sum mode
    const basePayload = {
      name,
      description: form.description.trim(),
      tags,
      type: form.type,
      discountType,
      discountValue,
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

  const renderServiceCard = (service) => {
    const priceInfo = getServicePriceInfo(service);

    return (
      <div
        key={service.id}
        className={`group relative overflow-hidden rounded-3xl border bg-white shadow-sm shadow-purple-100/40 transition-all hover:-translate-y-0.5 hover:shadow-md ${
          service.active
            ? "border-purple-100"
            : "border-dashed border-neutral-200 bg-neutral-50/80"
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            service.active
              ? "bg-gradient-to-r from-purple-500 to-pink-500"
              : "bg-neutral-200"
          }`}
        />

        <div className="flex flex-col gap-4 p-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={`break-words text-base font-bold ${
                      service.active ? "text-neutral-950" : "text-neutral-500"
                    }`}
                  >
                    {service.name}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      service.active
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200"
                    }`}
                  >
                    {service.active ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                    {service.active ? "Active" : "Inactive"}
                  </span>
                  {priceInfo.hasDiscount && (
                    <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100">
                      {priceInfo.discountLabel}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {renderCategoryLabel(service)}
                  {service.type === "package" && (
                    <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                      Package
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-neutral-600">
                <Clock className="h-4 w-4 text-purple-500" />
                <span className="font-semibold text-neutral-900">
                  {service.duration} min
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-neutral-600 sm:col-span-1 lg:col-span-2">
                <Wallet className="h-4 w-4 text-pink-500" />
                {priceInfo.hasDiscount ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-neutral-400 line-through">
                      {formatPrice(priceInfo.originalPrice)} դր
                    </span>
                    <span className="font-bold text-neutral-950">
                      {formatPrice(priceInfo.discountedPrice)} դր
                    </span>
                  </span>
                ) : (
                  <span className="font-bold text-neutral-950">
                    {formatPrice(priceInfo.originalPrice)} դր
                  </span>
                )}
              </div>
            </div>

            {service.description && (
              <p className="line-clamp-2 text-sm leading-relaxed text-neutral-500">
                {service.description}
              </p>
            )}
            {Array.isArray(service.tags) && service.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                <Tag className="h-3.5 w-3.5 text-neutral-400" />
                {service.tags.slice(0, 4).map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="rounded-full bg-neutral-100 px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1 border-t border-neutral-100 pt-3 sm:border-t-0 sm:pt-0">
            <Button
              disabled={isSaving}
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-2xl text-neutral-500 hover:bg-amber-50 hover:text-amber-700"
              title={service.active ? "Deactivate" : "Activate"}
              onClick={() => handleToggleActive(service)}
            >
              {service.active ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <Button
              disabled={isSaving}
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-2xl text-neutral-500 hover:bg-purple-50 hover:text-purple-700"
              title="Edit"
              onClick={() => openEditModal(service)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            {deleteConfirmId === service.id ? (
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-10 rounded-2xl px-3 text-xs"
                  onClick={() => handleDelete(service.id)}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 rounded-2xl px-3 text-xs"
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
                className="h-10 w-10 rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-700"
                title="Delete"
                onClick={() => setDeleteConfirmId(service.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderServiceSection = (title, count, sectionServices, tone) => {
    if (sectionServices.length === 0) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-neutral-800">{title}</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              tone === "active"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {count}
          </span>
        </div>
        <div className={`grid gap-3 ${fullPage ? "xl:grid-cols-2" : ""}`}>
          {sectionServices.map(renderServiceCard)}
        </div>
      </section>
    );
  };

  return (
    <>
      <Card
        className={`overflow-hidden rounded-3xl border-purple-100 bg-gradient-to-br from-purple-50/80 via-white to-pink-50/60 shadow-lg shadow-purple-100/40 ${
          fullPage ? "lg:col-span-3" : ""
        }`}
      >
        <CardContent className="space-y-6 p-4 sm:p-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm ring-1 ring-purple-100">
                  <Settings className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-2xl font-bold text-neutral-950 sm:text-3xl">
                    Services
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                    Manage service prices, duration, categories, and booking
                    options clients see when booking.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white bg-white/80 p-2 text-center shadow-sm">
              <div className="px-2">
                <p className="text-lg font-bold text-neutral-950">
                  {services.length}
                </p>
                <p className="text-[11px] font-semibold uppercase text-neutral-400">
                  Total
                </p>
              </div>
              <div className="px-2">
                <p className="text-lg font-bold text-emerald-700">
                  {activeServices.length}
                </p>
                <p className="text-[11px] font-semibold uppercase text-neutral-400">
                  Active
                </p>
              </div>
              <div className="px-2">
                <p className="text-lg font-bold text-neutral-500">
                  {inactiveServices.length}
                </p>
                <p className="text-[11px] font-semibold uppercase text-neutral-400">
                  Inactive
                </p>
              </div>
            </div>
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
            <div className="grid gap-3 xl:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-3xl border border-purple-100 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 h-4 w-36 rounded-full bg-purple-100" />
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="h-10 rounded-2xl bg-neutral-100" />
                    <div className="h-10 rounded-2xl bg-neutral-100" />
                  </div>
                  <div className="h-3 w-2/3 rounded-full bg-neutral-100" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && services.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-purple-200 bg-white/80 p-8 text-center shadow-sm sm:p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-700">
                <Scissors className="h-7 w-7" />
              </div>
              <div>
                <p className="text-lg font-bold text-neutral-900">
                  No services yet
                </p>
                <p className="mt-1 max-w-md text-sm text-neutral-500">
                  Add your first service so clients can choose a price,
                  duration, and booking option.
                </p>
              </div>
              <Button
                onClick={openAddModal}
                className="rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2.5 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600"
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
              <div className="flex flex-col gap-3 rounded-3xl border border-white bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-600">
                  Services remain visible here whether active or inactive.
                </p>
                <Button
                  onClick={openAddModal}
                  disabled={isSaving}
                  className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>
              </div>

              <div className="space-y-6">
                {renderServiceSection(
                  "Active services",
                  activeServices.length,
                  activeServices,
                  "active"
                )}
                {renderServiceSection(
                  "Inactive services",
                  inactiveServices.length,
                  inactiveServices,
                  "inactive"
                )}
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
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col animate-in overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* Modal header — sticky top */}
            <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-purple-100">
                  {editingService ? (
                    <Pencil className="h-5 w-5 text-purple-700" />
                  ) : (
                    <Plus className="h-5 w-5 text-purple-700" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-950">
                    {editingService ? "Edit service" : "Add service"}
                  </h3>
                  <p className="text-xs text-neutral-500 sm:text-sm">
                    {editingService
                      ? "Update the service details below"
                      : "Fill in the details for the new service"}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="rounded-2xl p-2 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div className="flex-1 overflow-y-auto bg-neutral-50/60 p-4 sm:p-6">
              {/* Modal error */}
              {modalError && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-5">
                <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">
                      Basic details
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Name the service and choose whether it is a single service
                      or package.
                    </p>
                  </div>

                  {/* Service name */}
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Service name
                    <input
                      className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      placeholder="e.g. Haircut, Beard Trim"
                      disabled={isSaving}
                      value={form.name}
                      onChange={(e) =>
                        handleFieldChange("name", e.target.value)
                      }
                      autoFocus
                    />
                  </label>

                  {/* ── Service type toggle ── */}
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Service type
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                </section>

                {/* ── Price & Duration ── */}
                <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">
                      Price and duration
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      These values are saved exactly as entered or as package
                      sum mode defines them.
                    </p>
                  </div>
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
                          {formatPrice(computedPackagePrice)}{" "}
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
                </section>

                {/* ── Service discount ── */}
                <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                      Service discount
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Optional service-level discount shown before promo codes.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-semibold">
                      Discount type
                      <select
                        className="w-full rounded-2xl border border-rose-200 bg-white p-3 font-normal transition-colors focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                        disabled={isSaving}
                        value={form.discountType}
                        onChange={(e) =>
                          handleFieldChange("discountType", e.target.value)
                        }
                      >
                        <option value="none">No discount</option>
                        <option value="percent">Percent discount</option>
                        <option value="fixed">Fixed discount</option>
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm font-semibold">
                      Discount value
                      <input
                        className="w-full rounded-2xl border border-rose-200 bg-white p-3 font-normal transition-colors focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-neutral-100"
                        disabled={isSaving || form.discountType === "none"}
                        min={form.discountType === "percent" ? "1" : "0"}
                        max={
                          form.discountType === "percent"
                            ? "100"
                            : Number.isFinite(formOriginalPrice)
                              ? String(formOriginalPrice)
                              : undefined
                        }
                        placeholder={
                          form.discountType === "percent"
                            ? "1-100"
                            : form.discountType === "fixed"
                              ? "Amount in դր"
                              : "0"
                        }
                        type="number"
                        value={form.discountValue}
                        onChange={(e) =>
                          handleFieldChange("discountValue", e.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>

                <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">
                      Category and description
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Help clients understand where this service belongs.
                    </p>
                  </div>

                  {/* ── Category type toggle ── */}
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Category type
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        handleFieldChange("categoryType", "system")
                      }
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
                      onClick={() =>
                        handleFieldChange("categoryType", "custom")
                      }
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
                      onChange={(e) =>
                        handleFieldChange("tags", e.target.value)
                      }
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
                </section>
              </div>
            </div>

            {/* Modal footer — sticky bottom */}
            <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button
                variant="ghost"
                disabled={isSaving}
                onClick={closeModal}
                className="w-full rounded-2xl sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  isSaving ||
                  (form.categoryType === "custom" && !form.customCategoryId)
                }
                onClick={handleSave}
                className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
              >
                {isSaving
                  ? "Saving..."
                  : editingService
                    ? "Save service"
                    : "Add service"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
