import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import ConfirmModal from "@/shared/components/common/ConfirmModal";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

const EMPTY_FORM = {
  title: "",
  issuedBy: "",
  issueDate: "",
  expiryDate: "",
  description: "",
};

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
  }).format(d);
}

function formatDateInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function isExpired(expiryDate) {
  if (!expiryDate) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return new Date(expiryDate) < now;
}

const getCertificationId = (cert) => cert?._id || cert?.id;

export default function CertificationsManager() {
  const { currentUser } = useSelector((state) => state.auth);
  const [certifications, setCertifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function fetchCertifications() {
      try {
        const { data } = await api.get(
          `/barbers/${currentUser.id}/certifications`
        );
        if (isMounted) {
          setCertifications(data || []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load certifications"
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchCertifications();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);


  const openAddModal = () => {
    setEditingCert(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSelectedImage(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cert) => {
    setEditingCert(cert);
    setForm({
      title: cert.title || "",
      issuedBy: cert.issuedBy || "",
      issueDate: formatDateInput(cert.issueDate),
      expiryDate: formatDateInput(cert.expiryDate),
      description: cert.description || "",
    });
    setFormError("");
    setSelectedImage(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const closeModal = ({ force = false } = {}) => {
    if (isSaving && !force) return;
    setIsModalOpen(false);
    setEditingCert(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSelectedImage(null);
    setImagePreview(null);
  };

  const updateForm = (field, value) => {
    setFormError("");
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFormError("Only JPEG, PNG, and WEBP images are allowed");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Image must be 5MB or smaller");
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setFormError("");
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateForm = () => {
    if (!form.title.trim()) {
      setFormError("Title is required");
      return false;
    }

    if (!form.issuedBy.trim()) {
      setFormError("Issued by is required");
      return false;
    }

    if (!form.issueDate) {
      setFormError("Issue date is required");
      return false;
    }

    const issueDateObj = new Date(form.issueDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (issueDateObj > today) {
      setFormError("Issue date cannot be in the future");
      return false;
    }

    if (form.expiryDate) {
      const expiryDateObj = new Date(form.expiryDate);

      if (expiryDateObj <= issueDateObj) {
        setFormError("Expiry date must be after issue date");
        return false;
      }
    }

    return true;
  };

  const saveCertification = async (event) => {
    event.preventDefault();

    if (!currentUser?.id || isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    setFormError("");

    try {
      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("issuedBy", form.issuedBy.trim());
      formData.append("issueDate", form.issueDate);
      if (form.expiryDate) {
        formData.append("expiryDate", form.expiryDate);
      }
      if (form.description) {
        formData.append("description", form.description.trim());
      }
      if (selectedImage) {
        formData.append("certificateImage", selectedImage);
      }

      if (editingCert) {
        const editingCertId = getCertificationId(editingCert);

        if (!editingCertId) {
          setFormError("Could not edit this certification. Please refresh and try again.");
          setIsSaving(false);
          return;
        }

        const { data } = await api.put(
          `/barbers/certifications/${editingCertId}`,
          formData
        );
        setCertifications((currentCerts) =>
          currentCerts.map((cert) =>
            String(getCertificationId(cert)) === String(editingCertId)
              ? data
              : cert
          )
        );
      } else {
        const { data } = await api.post("/barbers/certifications", formData);
        setCertifications((currentCerts) => [...currentCerts, data]);
      }

      closeModal({ force: true });
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.message ||
          "Could not save certification"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirmation = (cert) => {
    setDeleteTarget(cert);
  };

  const closeDeleteConfirmation = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    const deleteTargetId = getCertificationId(deleteTarget);

    if (!deleteTargetId) {
      setError("Could not delete this certification. Please refresh and try again.");
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);

    try {
      await api.delete(`/barbers/certifications/${deleteTargetId}`);
      setCertifications((currentCerts) =>
        currentCerts.filter(
          (cert) => String(getCertificationId(cert)) !== String(deleteTargetId)
        )
      );
      setDeleteTarget(null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not delete certification"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-neutral-950">Certifications</h3>
        <p className="mt-3 text-sm text-neutral-500">
          Loading certifications...
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">Certifications</h3>
        <p className="text-sm text-neutral-500">
          Add your professional certificates and qualifications.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button onClick={openAddModal}>
        <Plus className="mr-2 h-4 w-4" />
        Add Certification
      </Button>

      {certifications.length === 0 ? (
        <p className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">
          No certifications yet. Add your first certification.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {certifications.map((cert) => {
            const expired = isExpired(cert.expiryDate);
            const certId = getCertificationId(cert);

            return (
              <div
                className="relative rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm"
                key={certId}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎓</span>
                      <h4 className="truncate font-semibold text-neutral-950">
                        {cert.title || "Certification"}
                      </h4>
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">
                      {cert.issuedBy || ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Issued: {formatDate(cert.issueDate)}
                    </p>
                    {cert.expiryDate && (
                      <p className="text-xs text-neutral-500">
                        Expires: {formatDate(cert.expiryDate)}
                      </p>
                    )}
                    {expired && (
                      <span className="mt-1 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        Expired
                      </span>
                    )}
                    {cert.description && (
                      <p className="mt-2 text-xs text-neutral-500">
                        {cert.description}
                      </p>
                    )}
                    {cert.imageUrl && (
                      <a
                        className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:underline"
                        href={getMediaUrl(cert.imageUrl)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        View certificate
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label="Edit certification"
                      onClick={() => openEditModal(cert)}
                      size="icon"
                      variant="ghost"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label="Delete certification"
                      onClick={() => openDeleteConfirmation(cert)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {cert.imageUrl && (
                  <img
                    alt={cert.title || "Certificate"}
                    className="mt-3 aspect-video w-full rounded-xl object-cover"
                    src={getMediaUrl(cert.imageUrl)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">
                  {editingCert ? "Edit Certification" : "Add Certification"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {editingCert
                    ? "Update your certification details."
                    : "Add a new professional certification."}
                </p>
              </div>
              <Button
                aria-label="Close"
                disabled={isSaving}
                onClick={closeModal}
                size="icon"
                variant="outline"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={saveCertification}>
              <label className="grid gap-2 text-sm font-semibold">
                Title
                <input
                  className="rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="e.g. Master Barber Certificate"
                  required
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Issued by
                <input
                  className="rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="e.g. Yerevan Beauty Academy"
                  required
                  value={form.issuedBy}
                  onChange={(event) =>
                    updateForm("issuedBy", event.target.value)
                  }
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Issue date
                  <input
                    className="rounded-2xl border p-3 font-normal"
                    disabled={isSaving}
                    max={new Date().toISOString().split("T")[0]}
                    required
                    type="date"
                    value={form.issueDate}
                    onChange={(event) =>
                      updateForm("issueDate", event.target.value)
                    }
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold">
                  Expiry date
                  <input
                    className="rounded-2xl border p-3 font-normal"
                    disabled={isSaving}
                    min={form.issueDate || undefined}
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) =>
                      updateForm("expiryDate", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold">
                Certificate image
                <input
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  disabled={isSaving}
                  ref={fileInputRef}
                  type="file"
                  onChange={handleImageSelect}
                />
              </label>

              {/* Image preview area */}
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      alt="Certificate preview"
                      className="max-h-48 w-full rounded-xl object-contain"
                      src={imagePreview}
                    />
                    <Button
                      aria-label="Remove image"
                      className="absolute right-2 top-2"
                      disabled={isSaving}
                      onClick={removeSelectedImage}
                      size="icon"
                      variant="outline"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : editingCert && editingCert.imageUrl && !selectedImage ? (
                  <div className="relative">
                    <img
                      alt="Current certificate"
                      className="max-h-48 w-full rounded-xl object-contain"
                      src={getMediaUrl(editingCert.imageUrl)}
                    />
                    <p className="mt-2 text-center text-xs text-neutral-500">
                      Current image. Select a new file to replace it.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p className="text-sm text-neutral-500">
                      No image selected
                    </p>
                  </div>
                )}

                <Button
                  className="mt-3 w-full"
                  disabled={isSaving}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  {imagePreview || (editingCert && editingCert.imageUrl)
                    ? "Change image"
                    : "Upload image"}
                </Button>
                <p className="mt-2 text-center text-xs text-neutral-400">
                  JPEG, PNG, or WEBP. Max 5MB.
                </p>
              </div>

              <label className="grid gap-2 text-sm font-semibold">
                Description
                <textarea
                  className="min-h-20 rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                />
              </label>

              {formError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </p>
              )}

              <div className="grid gap-2 sm:flex sm:justify-end">
                <Button
                  disabled={isSaving}
                  onClick={closeModal}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={isSaving} type="submit">
                  {isSaving
                    ? "Saving..."
                    : editingCert
                      ? "Save changes"
                      : "Add certification"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          isSubmitting={isDeleting}
          message={`Are you sure you want to delete "${deleteTarget.title || "this certification"}"?`}
          onClose={closeDeleteConfirmation}
          onConfirm={confirmDelete}
          title="Delete certification"
        />
      )}
    </section>
  );
}
