import { useState, useEffect } from "react";
import { useSelector } from "react-redux";

import { fetchServiceCategories } from "@/shared/api/serviceCategories";
import ServiceCard from "./ServiceCard";
import ServiceManagerHeader from "./ServiceManagerHeader";
import ServiceBasicDetailsForm from "./ServiceBasicDetailsForm";
import ServiceSinglePriceForm from "./ServiceSinglePriceForm";
import ServiceDiscountForm from "./ServiceDiscountForm";
import ServiceCategoryDescriptionForm from "./ServiceCategoryDescriptionForm";
import ServicePackagePricingForm from "./ServicePackagePricingForm";
import ServiceFormModal from "./ServiceFormModal";

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

  const [customCategories, setCustomCategories] = useState([]);

  useEffect(() => {
    if (!barberId) return;
    let cancelled = false;
    fetchServiceCategories(barberId)
      .then((cats) => {
        if (!cancelled) {
          setCustomCategories(Array.isArray(cats) ? cats.filter((c) => c.source === "custom") : []);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [barberId]);

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

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

  const availablePackageServices = services.filter(
    (service) =>
      service.active &&
      service.type !== "package" &&
      (!editingService || String(service.id) !== String(editingService.id))
  );
  const activeServices = services.filter((service) => service.active);
  const inactiveServices = services.filter((service) => !service.active);

  const openAddModal = () => {
    setEditingService(null);
    setForm(emptyForm);
    setModalError("");
    setShowModal(true);
  };

  const openEditModal = (service) => {
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
    if (!isPackageSumPrice) {
      if (!Number.isFinite(price) || price < 0) {
        setModalError("Price must be a non-negative number.");
        return;
      }
    }
    if (!isPackageSumDuration) {
      if (!Number.isFinite(duration) || duration <= 0) {
        setModalError("Duration must be a positive number.");
        return;
      }
    }
    if (form.categoryType === "custom" && !form.customCategoryId) {
      setModalError("Please select a custom category or add a new one.");
      return;
    }
    if (!["none", "percent", "fixed"].includes(discountType)) {
      setModalError("Please choose a valid discount type.");
      return;
    }
    if (discountType === "percent") {
      if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
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

    const basePayload = {
      name,
      description: form.description.trim(),
      tags,
      type: form.type,
      discountType,
      discountValue,
    };

    if (!isPackageSumPrice) basePayload.price = price;
    if (!isPackageSumDuration) basePayload.duration = duration;
    if (form.type === "package") {
      basePayload.includedServiceIds = form.includedServiceIds;
      basePayload.packagePriceMode = form.packagePriceMode;
      basePayload.packageDurationMode = form.packageDurationMode;
    }
    if (form.categoryType === "custom") {
      basePayload.category = "other";
      basePayload.customCategoryId = form.customCategoryId || null;
    } else {
      basePayload.category = form.category;
      basePayload.customCategoryId = null;
    }

    if (editingService) {
      try {
        await updateService(editingService.id, basePayload);
        closeModal();
      } catch (err) {
        setModalError(err.response?.data?.message || "Could not update service.");
      }
    } else {
      try {
        await addService(basePayload);
        closeModal();
      } catch (err) {
        setModalError(err.response?.data?.message || "Could not create service.");
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

  return (
    <>
      <ServiceManagerHeader
        servicesCount={services.length}
        activeCount={activeServices.length}
        inactiveCount={inactiveServices.length}
        error={error}
        isLoading={isLoading}
        isSaving={isSaving}
        isEmpty={services.length === 0}
        onAdd={openAddModal}
        fullPage={fullPage}
      >
        {!isLoading && services.length > 0 && (
          <div className="space-y-6">
            {activeServices.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-neutral-800">Active services</h3>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">{activeServices.length}</span>
                </div>
                <div className={`grid gap-3 ${fullPage ? "xl:grid-cols-2" : ""}`}>
                  {activeServices.map((service) => (
                    <ServiceCard key={service.id} service={service} customCategories={customCategories} isSaving={isSaving} deleteConfirmId={deleteConfirmId}
                      onEdit={() => openEditModal(service)} onToggleActive={() => handleToggleActive(service)}
                      onDeleteConfirm={() => setDeleteConfirmId(service.id)} onDeleteCancel={() => setDeleteConfirmId(null)}
                      onDeleteConfirmExecute={() => handleDelete(service.id)} />
                  ))}
                </div>
              </section>
            )}
            {inactiveServices.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-neutral-800">Inactive services</h3>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">{inactiveServices.length}</span>
                </div>
                <div className={`grid gap-3 ${fullPage ? "xl:grid-cols-2" : ""}`}>
                  {inactiveServices.map((service) => (
                    <ServiceCard key={service.id} service={service} customCategories={customCategories} isSaving={isSaving} deleteConfirmId={deleteConfirmId}
                      onEdit={() => openEditModal(service)} onToggleActive={() => handleToggleActive(service)}
                      onDeleteConfirm={() => setDeleteConfirmId(service.id)} onDeleteCancel={() => setDeleteConfirmId(null)}
                      onDeleteConfirmExecute={() => handleDelete(service.id)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </ServiceManagerHeader>

      <ServiceFormModal showModal={showModal} editingService={editingService} isSaving={isSaving} modalError={modalError}
        saveDisabled={isSaving || (form.categoryType === "custom" && !form.customCategoryId)}
        onClose={closeModal} onSave={handleSave}>
        <ServiceBasicDetailsForm form={form} handleFieldChange={handleFieldChange} isSaving={isSaving} />
        <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-sm font-bold text-neutral-900">Price and duration</p>
            <p className="mt-1 text-xs text-neutral-500">These values are saved exactly as entered or as package sum mode defines them.</p>
          </div>
          {form.type === "package" ? (
            <ServicePackagePricingForm form={form} handleFieldChange={handleFieldChange} isSaving={isSaving}
              availablePackageServices={availablePackageServices} formatPrice={formatPrice}
              isPackageSumPrice={isPackageSumPrice} isPackageSumDuration={isPackageSumDuration}
              computedPackagePrice={computedPackagePrice}
              computedPackageDuration={services.filter((s) => form.includedServiceIds.some((id) => String(id) === String(s.id))).reduce((sum, s) => sum + (s.duration || 0), 0)} />
          ) : (
            <ServiceSinglePriceForm form={form} handleFieldChange={handleFieldChange} isSaving={isSaving} />
          )}
        </section>
        <ServiceDiscountForm form={form} handleFieldChange={handleFieldChange} isSaving={isSaving} formOriginalPrice={formOriginalPrice} />
        <ServiceCategoryDescriptionForm form={form} handleFieldChange={handleFieldChange} isSaving={isSaving} barberId={barberId} onCustomCategoriesChange={setCustomCategories} />
      </ServiceFormModal>
    </>
  );
}
