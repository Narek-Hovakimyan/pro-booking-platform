import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/shared/api/axios";
import {
  Gift,
  Plus,
  Save,
  Trash2,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Pencil,
  Wallet,
  Clock,
  Hash,
  CheckCircle2,
  Ban,
  Copy,
  Globe,
  Lock,
} from "lucide-react";

const emptyForm = {
  title: "",
  type: "amount",
  amount: "",
  serviceId: "",
  maxUses: "1",
  expiresAt: "",
  code: "",
  visibility: "private",
};

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA");
}

function formatPrice(price) {
  return Number(price).toLocaleString();
}

export default function VoucherManager() {
  const { currentUser } = useSelector((state) => state.auth);
  const barberId = currentUser?.id || currentUser?._id;
  const canManage = Boolean(barberId && currentUser?.role === "barber");

  const allServices = useSelector((state) => state.services);
  const services = Array.isArray(allServices)
    ? allServices.filter(
        (s) => String(s.barberId) === String(barberId) && s.active
      )
    : [];

  /* ── State ── */
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [copiedId, setCopiedId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  /* ── Copy code ── */
  const copyCode = async (voucher) => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopiedId(voucher._id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = voucher.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(voucher._id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  /* ── Load vouchers ── */
  const loadVouchers = useCallback(() => {
    if (!canManage) return;

    api
      .get(`/vouchers/owner/barber/${barberId}`)
      .then(({ data }) => {
        setVouchers(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => {
        setError("Could not load vouchers. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canManage, barberId]);

  useEffect(() => {
    if (canManage) loadVouchers();
  }, [canManage, loadVouchers]);

  /* ── Flash success ── */
  const flashSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  /* ── Modal helpers ── */
  const openCreateModal = () => {
    setEditingVoucher(null);
    setForm(emptyForm);
    setModalError("");
    setShowModal(true);
  };

  const openEditModal = (voucher) => {
    setEditingVoucher(voucher);
    setForm({
      title: voucher.title || "",
      type: voucher.type || "amount",
      amount: String(voucher.amount ?? ""),
      serviceId: voucher.serviceId ? String(voucher.serviceId) : "",
      maxUses: String(voucher.maxUses ?? "1"),
      expiresAt: voucher.expiresAt
        ? new Date(voucher.expiresAt).toISOString().slice(0, 10)
        : "",
      code: "",
      visibility: voucher.visibility || "private",
    });
    setModalError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVoucher(null);
    setForm(emptyForm);
    setModalError("");
  };

  const handleField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ── Save (create or update) ── */
  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) {
      setModalError("Title is required.");
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setModalError("Amount must be a positive number.");
      return;
    }

    const maxUses = Number(form.maxUses);
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      setModalError("Max uses must be >= 1.");
      return;
    }

    if (form.type === "service" && !form.serviceId) {
      setModalError("Please select a service for service-specific vouchers.");
      return;
    }

    let expiresAt = null;
    if (form.expiresAt) {
      const parsed = new Date(form.expiresAt);
      if (isNaN(parsed.getTime())) {
        setModalError("Invalid expiration date.");
        return;
      }
      expiresAt = parsed.toISOString();
    }

    let code = form.code.trim().toUpperCase();
    if (code && (code.length < 4 || code.length > 20)) {
      setModalError("Code must be between 4 and 20 alphanumeric characters.");
      return;
    }
    if (code && !/^[A-Z0-9]+$/.test(code)) {
      setModalError("Code must be alphanumeric (letters and numbers only).");
      return;
    }

    setModalError("");
    setSaving(true);

    try {
      if (editingVoucher) {
        const payload = {
          title,
          amount,
          maxUses,
          serviceId: form.type === "service" ? form.serviceId : null,
          expiresAt,
          active: editingVoucher.active,
          visibility: form.visibility,
        };
        await api.put(`/vouchers/${editingVoucher._id}`, payload);
        flashSuccess("Voucher updated successfully.");
      } else {
        const payload = {
          ownerType: "barber",
          ownerId: barberId,
          title,
          type: form.type,
          amount,
          serviceId: form.type === "service" ? form.serviceId : null,
          maxUses,
          expiresAt,
          visibility: form.visibility,
        };
        if (code) payload.code = code;
        await api.post("/vouchers", payload);
        flashSuccess("Voucher created successfully.");
      }
      closeModal();
      setLoading(true);
      loadVouchers();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        "Could not save voucher. Please try again.";
      setModalError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ── Toggle active ── */
  const handleToggleActive = async (voucher) => {
    try {
      await api.put(`/vouchers/${voucher._id}`, {
        active: !voucher.active,
      });
      flashSuccess(
        voucher.active ? "Voucher deactivated." : "Voucher activated."
      );
      setLoading(true);
      loadVouchers();
    } catch (err) {
      const msg = err.response?.data?.message || "Could not update voucher.";
      setError(msg);
    }
  };

  /* ── Delete (soft) ── */
  const handleDelete = async (voucher) => {
    try {
      await api.delete(`/vouchers/${voucher._id}`);
      flashSuccess("Voucher deleted.");
      setLoading(true);
      loadVouchers();
    } catch (err) {
      const msg = err.response?.data?.message || "Could not delete voucher.";
      setError(msg);
    }
  };

  /* ── Render ── */
  if (!canManage) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white sm:rounded-3xl">
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="mb-5">
          <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Gift className="h-6 w-6 text-neutral-700" />
            Promo Codes & Discounts
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {vouchers.length} promo code{vouchers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Success flash */}
        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Global error */}
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="mb-2 h-4 w-40 rounded-full bg-neutral-200" />
                <div className="h-3 w-24 rounded-full bg-neutral-100" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && vouchers.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200">
              <Gift className="h-7 w-7 text-neutral-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-neutral-700">
                No promo codes yet
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Create promo codes to offer discounts to your
                clients.
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Create Voucher
            </button>
          </div>
        )}

        {/* List */}
        {!loading && vouchers.length > 0 && (
          <>
            <div className="mb-4 flex sm:justify-end">
              <button
                onClick={openCreateModal}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Create Voucher
              </button>
            </div>

            <div className="space-y-3">
              {vouchers.map((v) => (
                <div
                  key={v._id}
                  className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                    !v.active
                      ? "border-dashed border-neutral-300 bg-neutral-50/50"
                      : "border-neutral-200"
                  }`}
                >
                  {/* Active/inactive bar */}
                  <div
                    className={`absolute left-0 top-0 h-full w-1 ${
                      v.active ? "bg-emerald-500" : "bg-neutral-300"
                    }`}
                  />

                  <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-semibold ${
                            v.active ? "text-neutral-950" : "text-neutral-400"
                          }`}
                        >
                          {v.code}
                        </span>
                        <button
                          onClick={() => copyCode(v)}
                          className="inline-flex items-center justify-center rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-blue-600"
                          title="Copy code"
                        >
                          {copiedId === v._id ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {!v.active && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                            <Ban className="h-3 w-3" />
                            Inactive
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {v.type === "service" ? "Service" : "Amount"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            v.visibility === "public"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {v.visibility === "public" ? (
                            <Globe className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {v.visibility === "public" ? "Public" : "Private"}
                        </span>
                      </div>

                      <p className="mt-1 text-sm font-medium text-neutral-800">
                        {v.title}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <Wallet className="h-3.5 w-3.5" />
                          {formatPrice(v.amount)} դր
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5" />
                          {v.currentUses}/{v.maxUses} used
                        </span>
                        {v.expiresAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Expires {formatDate(v.expiresAt)}
                          </span>
                        )}
                      </div>

                      {v.serviceId && v.type === "service" && (
                        <p className="mt-1 text-xs text-neutral-400">
                          Service-specific:{" "}
                          {services.find(
                            (s) => String(s.id) === String(v.serviceId)
                          )?.name || String(v.serviceId).slice(-6)}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        disabled={saving}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-amber-600"
                        title={v.active ? "Deactivate" : "Activate"}
                        onClick={() => handleToggleActive(v)}
                      >
                        {v.active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        disabled={saving}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-blue-600"
                        title="Edit"
                        onClick={() => openEditModal(v)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        disabled={saving}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-red-600"
                        title="Delete"
                        onClick={() => handleDelete(v)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                  {editingVoucher ? (
                    <Pencil className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Gift className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {editingVoucher ? "Edit Voucher" : "Create Voucher"}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {editingVoucher
                      ? "Update the promo code details"
                      : "Create a new discount promo code"}
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {modalError && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Code (create only) */}
                {!editingVoucher && (
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Code (optional)
                    <span className="text-xs font-normal text-neutral-400">
                      Leave empty to auto-generate. Alphanumeric 4-20 chars.
                    </span>
                    <input
                      className="w-full rounded-2xl border border-neutral-300 p-3 font-normal uppercase transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      placeholder="SUMMER10"
                      disabled={saving}
                      maxLength={20}
                      value={form.code}
                      onChange={(e) =>
                        handleField("code", e.target.value.toUpperCase())
                      }
                    />
                  </label>
                )}

                {/* Title */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Title
                  <input
                    className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    placeholder="e.g. Summer Special"
                    disabled={saving}
                    value={form.title}
                    onChange={(e) => handleField("title", e.target.value)}
                    autoFocus
                  />
                </label>

                {/* Type (create only) */}
                {!editingVoucher && (
                  <>
                    <label className="grid gap-1.5 text-sm font-semibold">
                      Type
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleField("type", "amount")}
                        className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                          form.type === "amount"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                        }`}
                      >
                        Amount
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleField("type", "service")}
                        className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
                          form.type === "service"
                            ? "border-violet-500 bg-violet-50 text-violet-700"
                            : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                        }`}
                      >
                        Service
                      </button>
                    </div>
                  </>
                )}

                {/* Amount */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Amount (դր)
                  <input
                    className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    placeholder="1000"
                    type="number"
                    min="1"
                    disabled={saving}
                    value={form.amount}
                    onChange={(e) => handleField("amount", e.target.value)}
                  />
                </label>

                {/* Service selector (when type=service) */}
                {form.type === "service" && (
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Service
                    <span className="text-xs font-normal text-neutral-400">
                      Select an active single service
                    </span>
                    <select
                      className="w-full rounded-2xl border border-neutral-300 bg-white p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      disabled={saving}
                      value={form.serviceId}
                      onChange={(e) =>
                        handleField("serviceId", e.target.value)
                      }
                    >
                      <option value="">Select a service...</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatPrice(s.price)} դր)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Visibility */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Visibility
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleField("visibility", "private")}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      form.visibility === "private"
                        ? "border-neutral-500 bg-neutral-100 text-neutral-800"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    Private
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleField("visibility", "public")}
                    className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      form.visibility === "public"
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    Public
                  </button>
                </div>
                <p className="-mt-2 text-xs text-neutral-400">
                  Public vouchers are visible to clients during booking.
                </p>

                {/* Max uses */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Max uses
                  <input
                    className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    placeholder="1"
                    type="number"
                    min="1"
                    disabled={saving}
                    value={form.maxUses}
                    onChange={(e) => handleField("maxUses", e.target.value)}
                  />
                </label>

                {/* Expires at */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  Expires at (optional)
                  <span className="text-xs font-normal text-neutral-400">
                    Leave empty for no expiration
                  </span>
                  <input
                    className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    type="date"
                    disabled={saving}
                    value={form.expiresAt}
                    onChange={(e) =>
                      handleField("expiresAt", e.target.value)
                    }
                  />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Saving..."
                  : editingVoucher
                    ? "Save Changes"
                    : "Create Voucher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
