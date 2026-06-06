import { useCallback, useEffect, useState } from "react";

import api from "@/shared/api/axios";
import {
  Gift,
  Plus,
  Save,
  X,
  AlertCircle,
  Pencil,
  Clock,
  Hash,
  Percent,
  Copy,
  Globe,

} from "lucide-react";
import SettingsCard from "./settings/SettingsCard";

const emptyForm = {
  title: "",
  description: "",
  discountType: "fixed",
  discountValue: "",
  applicableServiceIds: [],
  applicableBarberIds: [],
  startDate: "",
  endDate: "",
  maxUses: "1",
  code: "",
};

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA");
}

function formatPrice(price) {
  return `${Number(price).toLocaleString()} դր`;
}

export default function SalonPromotionsManager({ salonId, salonName }) {


  const [promotions, setPromotions] = useState([]);
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [copiedId, setCopiedId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  /* ── Copy code ── */
  const copyCode = async (promotion) => {
    try {
      await navigator.clipboard.writeText(promotion.code);
      setCopiedId(promotion._id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = promotion.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(promotion._id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  /* ── Load promotions ── */
  const loadPromotions = useCallback(() => {
    if (!salonId) return;
    setLoading(true);
    api
      .get(`/salons/${salonId}/promotions`)
      .then(({ data }) => {
        setPromotions(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => {
        setError("Could not load promotions. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [salonId]);

  /* ── Load references + promotions on mount ── */
  useEffect(() => {
    if (!salonId) return;

    let cancelled = false;

    async function loadAll() {
      // Load promotions
      try {
        setLoading(true);
        const promoRes = await api.get(`/salons/${salonId}/promotions`);
        if (!cancelled) {
          setPromotions(Array.isArray(promoRes.data) ? promoRes.data : []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Could not load promotions. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Load salon barbers and services for the selector
      try {
        const staffRes = await api.get(`/salons/${salonId}/staff`);
        if (!cancelled) {
          const members = Array.isArray(staffRes.data)
            ? staffRes.data
            : staffRes.data?.members || staffRes.data?.staff || [];
          setBarbers(members);
        }
      } catch {
        // silently fail
      }

      try {
        const bookingRes = await api.get(`/salons/${salonId}/public-booking`);
        if (!cancelled) {
          const allServices = Array.isArray(bookingRes.data?.services)
            ? bookingRes.data.services
            : bookingRes.data?.barbers?.flatMap((b) => b.services || []) || [];
          setServices(allServices);
        }
      } catch {
        // silently fail
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [salonId]);


  /* ── Flash success ── */
  const flashSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  /* ── Modal helpers ── */
  const openCreateModal = () => {
    setEditingPromotion(null);
    setForm(emptyForm);
    setModalError("");
    setShowModal(true);
  };

  const openEditModal = (promotion) => {
    setEditingPromotion(promotion);
    setForm({
      title: promotion.title || "",
      description: promotion.description || "",
      discountType: promotion.discountType || "fixed",
      discountValue: String(promotion.amount ?? ""),
      applicableServiceIds: promotion.applicableServiceIds?.map((s) => String(s._id || s)) || [],
      applicableBarberIds: promotion.applicableBarberIds?.map((b) => String(b._id || b)) || [],
      startDate: promotion.startDate
        ? new Date(promotion.startDate).toISOString().slice(0, 10)
        : "",
      endDate: promotion.expiresAt
        ? new Date(promotion.expiresAt).toISOString().slice(0, 10)
        : "",
      maxUses: String(promotion.maxUses ?? "1"),
      code: promotion.code || "",
    });
    setModalError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPromotion(null);
    setForm(emptyForm);
    setModalError("");
  };

  const handleField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleService = (serviceId) => {
    setForm((prev) => {
      const current = prev.applicableServiceIds || [];
      const strId = String(serviceId);
      const exists = current.some((id) => String(id) === strId);
      return {
        ...prev,
        applicableServiceIds: exists
          ? current.filter((id) => String(id) !== strId)
          : [...current, serviceId],
      };
    });
  };

  const handleToggleBarber = (barberId) => {
    setForm((prev) => {
      const current = prev.applicableBarberIds || [];
      const strId = String(barberId);
      const exists = current.some((id) => String(id) === strId);
      return {
        ...prev,
        applicableBarberIds: exists
          ? current.filter((id) => String(id) !== strId)
          : [...current, barberId],
      };
    });
  };

  /* ── Save (create or update) ── */
  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) {
      setModalError("Title is required.");
      return;
    }

    const discountValue = Number(form.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setModalError("Discount value must be a positive number.");
      return;
    }

    if (form.discountType === "percentage" && discountValue > 100) {
      setModalError("Percentage discount cannot exceed 100%.");
      return;
    }

    const maxUses = Number(form.maxUses);
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      setModalError("Max uses must be >= 1.");
      return;
    }

    const payload = {
      title,
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue,
      applicableServiceIds: form.applicableServiceIds,
      applicableBarberIds: form.applicableBarberIds,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      maxUses,
    };

    // Only send code for new promotions
    if (!editingPromotion) {
      payload.code = form.code.trim();
    }

    setSaving(true);
    setModalError("");

    try {
      if (editingPromotion) {
        await api.patch(
          `/salons/${salonId}/promotions/${editingPromotion._id}`,
          payload
        );
        flashSuccess("Promotion updated successfully.");
      } else {
        await api.post(`/salons/${salonId}/promotions`, payload);
        flashSuccess("Promotion created successfully.");
      }
      closeModal();
      loadPromotions();
    } catch (err) {
      const msg =
        err.response?.data?.message || "Could not save promotion.";
      setModalError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ── Toggle active ── */
  const handleToggleActive = async (promotion) => {
    try {
      await api.patch(`/salons/${salonId}/promotions/${promotion._id}`, {
        active: !promotion.active,
      });
      flashSuccess(
        promotion.active ? "Promotion deactivated." : "Promotion activated."
      );
      loadPromotions();
    } catch (err) {
      const msg = err.response?.data?.message || "Could not update promotion.";
      setError(msg);
    }
  };

  /* ── Unique services/barbers from promotions data ── */
  const uniqueServices = services.length > 0
    ? services
    : [
        ...new Map(
          promotions.flatMap((p) => p.applicableServiceIds || []).map((s) => [String(s._id || s), s])
        ).values(),
      ];

  const uniqueBarbers = barbers.length > 0
    ? barbers
    : [
        ...new Map(
          promotions.flatMap((p) => p.applicableBarberIds || []).map((b) => [String(b._id || b), b])
        ).values(),
      ];

  return (
    <SettingsCard
      title="Salon Promotions"
      description={`Manage discount promotions for ${salonName || "this salon"}.`}
    >
      {/* Success message */}
      {successMsg && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMsg}
        </p>
      )}

      {/* Create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {promotions.length} promotion{promotions.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          <Plus className="h-4 w-4" />
          Create Promotion
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && promotions.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <Gift className="h-10 w-10 text-neutral-300" />
          <div>
            <p className="text-lg font-semibold text-neutral-700">
              No promotions yet
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Create promotional offers for clients booking at your salon.
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {!loading && promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map((promotion) => (
            <div
              key={promotion._id}
              className={`rounded-2xl border p-4 transition ${
                promotion.active
                  ? "border-neutral-200 bg-white"
                  : "border-neutral-100 bg-neutral-50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-neutral-900 truncate">
                      {promotion.title}
                    </h4>
                    {promotion.visibility === "public" && (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    )}
                  </div>
                  {promotion.description && (
                    <p className="mt-0.5 text-sm text-neutral-500 line-clamp-2">
                      {promotion.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {promotion.discountType === "percentage" ? (
                        <Percent className="h-3 w-3" />
                      ) : (

                        <Hash className="h-3 w-3" />
                      )}
                      {promotion.discountType === "percentage"
                        ? `${promotion.amount}%`
                        : formatPrice(promotion.amount)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      <Hash className="h-3 w-3" />
                      {promotion.currentUses}/{promotion.maxUses} used
                    </span>
                    {promotion.expiresAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        <Clock className="h-3 w-3" />
                        {formatDate(promotion.expiresAt)}
                      </span>
                    )}
                  </div>
                  {/* Code badge */}
                  <div className="mt-2">
                    <button
                      onClick={() => copyCode(promotion)}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-mono font-bold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100"
                    >
                      <Copy className="h-3 w-3" />
                      {promotion.code}
                      {copiedId === promotion._id && (
                        <span className="text-emerald-600 font-bold">
                          Copied!
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEditModal(promotion)}
                    className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(promotion)}
                    className={`rounded-lg p-2 transition ${
                      promotion.active
                        ? "text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        : "text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600"
                    }`}
                    title={promotion.active ? "Deactivate" : "Activate"}
                  >
                    <span
                      className={`h-3 w-3 rounded-full ${
                        promotion.active
                          ? "bg-emerald-500"
                          : "bg-neutral-300"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ──────── Modal ──────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {editingPromotion
                  ? "Edit Promotion"
                  : "Create Promotion"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => handleField("title", e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                  placeholder="e.g. Summer Special"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Description (optional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleField("description", e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                  placeholder="Brief description"
                  rows={2}
                />
              </div>

              {/* Discount Type + Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    Discount Type
                  </label>
                  <select
                    value={form.discountType}
                    onChange={(e) => handleField("discountType", e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                  >
                    <option value="fixed">Fixed Amount (դր)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    {form.discountType === "percentage"
                      ? "Percentage"
                      : "Amount (դր)"}
                  </label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) =>
                      handleField("discountValue", e.target.value)
                    }
                    min="1"
                    max={form.discountType === "percentage" ? "100" : undefined}
                    className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                    placeholder={
                      form.discountType === "percentage" ? "e.g. 20" : "e.g. 5000"
                    }
                  />
                </div>
              </div>

              {/* Code */}
              {!editingPromotion && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    Code (leave empty to auto-generate)
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) =>
                      handleField("code", e.target.value.toUpperCase())
                    }
                    className="w-full rounded-xl border border-neutral-200 p-3 text-sm font-mono transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                    placeholder="SUMMER20"
                    maxLength={20}
                  />
                </div>
              )}

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => handleField("startDate", e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => handleField("endDate", e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                  />
                </div>
              </div>

              {/* Max Uses */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Max Uses
                </label>
                <input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) => handleField("maxUses", e.target.value)}
                  min="1"
                  className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                />
              </div>

              {/* Services selector */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Applicable Services (optional — leave empty for all)
                </label>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-200 p-2">
                  {uniqueServices.length === 0 && (
                    <p className="p-2 text-xs text-neutral-400">No services loaded</p>
                  )}
                  {uniqueServices.map((service) => {
                    const strId = String(service._id || service.id || service);
                    const name = service.name || service.title || strId;
                    const isSelected = (form.applicableServiceIds || []).some(
                      (id) => String(id) === strId
                    );
                    return (
                      <label
                        key={strId}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleService(strId)}
                          className="rounded border-neutral-300"
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Barbers selector */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Applicable Barbers (optional — leave empty for all)
                </label>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-200 p-2">
                  {uniqueBarbers.length === 0 && (
                    <p className="p-2 text-xs text-neutral-400">No barbers loaded</p>
                  )}
                  {uniqueBarbers.map((barber) => {
                    const strId = String(barber._id || barber.id || barber);
                    const name = barber.name || barber.barberName || strId;
                    const isSelected = (form.applicableBarberIds || []).some(
                      (id) => String(id) === strId
                    );
                    return (
                      <label
                        key={strId}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleBarber(strId)}
                          className="rounded border-neutral-300"
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Saving..."
                  : editingPromotion
                    ? "Update Promotion"
                    : "Create Promotion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
        </div>
      )}
    </SettingsCard>
  );
}
