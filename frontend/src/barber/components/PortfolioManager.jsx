import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Image,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  getMyPortfolio,
  getPortfolioImageBlob,
  deletePortfolioPhoto,
} from "@/shared/api/portfolio";
import ConfirmModal from "@/shared/components/common/ConfirmModal";
import { Button } from "@/shared/components/ui/button";
import PortfolioPhotoFormModal from "./PortfolioPhotoFormModal";

const getPortfolioId = (item) => item?._id || item?.id;

const getPreviewKey = (item, kind) => `${getPortfolioId(item)}:${kind}`;

export default function PortfolioManager() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const [items, setItems] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  /* ── Modal state (simple open/close + editing item) ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState(null);

  /* ── Delete confirmation ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /* ── Fetch portfolio items ── */
  useEffect(() => {
    if (!currentUserId) return;

    let mounted = true;

    async function fetchItems() {
      try {
        const data = await getMyPortfolio();
        if (mounted) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.message || "Could not load portfolio items"
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchItems();

    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    const nextUrls = {};

    async function loadPreviews() {
      const entries = await Promise.all(
        items.flatMap((item) => {
          const itemId = getPortfolioId(item);
          if (!itemId || item.active === false) return [];

          return ["before", "after"].map(async (kind) => {
            try {
              const blob = await getPortfolioImageBlob(itemId, kind);
              return [getPreviewKey(item, kind), URL.createObjectURL(blob)];
            } catch {
              return null;
            }
          });
        })
      );

      if (cancelled) {
        entries.forEach((entry) => {
          if (entry?.[1]) URL.revokeObjectURL(entry[1]);
        });
        return;
      }

      for (const entry of entries) {
        if (entry) nextUrls[entry[0]] = entry[1];
      }

      setPreviewUrls((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return nextUrls;
      });
    }

    loadPreviews();

    return () => {
      cancelled = true;
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  /* ── Modal open/close ── */
  const openAddModal = () => {
    setModalItem(null);
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setModalItem(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalItem(null);
  };

  /* ── Save complete callback from modal child ── */
  const handleSaveComplete = (savedItem) => {
    const savedId = getPortfolioId(savedItem);

    if (modalItem) {
      // Edit: replace in list
      setItems((prev) =>
        prev.map((item) =>
          String(getPortfolioId(item)) === String(savedId) ? savedItem : item
        )
      );
    } else {
      // Create: prepend
      setItems((prev) => [savedItem, ...prev]);
    }

    setIsSaving(false);
    closeModal();
  };

  /* ── Delete ── */
  const openDeleteConfirmation = (item) => {
    setDeleteTarget(item);
  };

  const closeDeleteConfirmation = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    const deleteId = getPortfolioId(deleteTarget);
    if (!deleteId) {
      setError("Could not delete this item. Please refresh and try again.");
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);

    try {
      await deletePortfolioPhoto(deleteId);
      setItems((prev) =>
        prev.filter((item) => String(getPortfolioId(item)) !== String(deleteId))
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not delete portfolio item"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-neutral-950">
          Before / After Portfolio
        </h3>
        <p className="mt-3 text-sm text-neutral-500">
          Loading portfolio...
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">
          Before / After Portfolio
        </h3>
        <p className="text-sm text-neutral-500">
          Showcase your work with before and after photos.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button onClick={openAddModal}>
        <Plus className="mr-2 h-4 w-4" />
        Add Before / After
      </Button>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200">
            <Image className="h-7 w-7 text-neutral-500" />
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-700">
              No portfolio items yet
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Add your first before/after photo pair to showcase your work.
            </p>
          </div>
          <Button
            onClick={openAddModal}
            className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-5 py-2.5 font-medium"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add your first portfolio
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {items.map((item) => {
            const itemId = getPortfolioId(item);
            const isActive = item.active !== false;
            const beforePreviewUrl = previewUrls[getPreviewKey(item, "before")];
            const afterPreviewUrl = previewUrls[getPreviewKey(item, "after")];

            return (
              <div
                key={itemId}
                className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                  !isActive
                    ? "border-dashed border-neutral-300 bg-neutral-50/50"
                    : "border-neutral-200"
                }`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-1 ${
                    isActive ? "bg-emerald-500" : "bg-neutral-300"
                  }`}
                />

                <div className="p-3 pl-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {!isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        <EyeOff className="h-3 w-3" />
                        Inactive
                      </span>
                    )}
                    {item.isPublic ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <Eye className="h-3 w-3" />
                        Public
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                        <EyeOff className="h-3 w-3" />
                        Private
                      </span>
                    )}
                    {item.consentConfirmed && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Consent ✓
                      </span>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-neutral-500">
                        Before
                      </p>
                      <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                        {beforePreviewUrl ? (
                          <img
                            src={beforePreviewUrl}
                            alt="Before"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-neutral-400">
                            <Image className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-neutral-500">
                        After
                      </p>
                      <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                        {afterPreviewUrl ? (
                          <img
                            src={afterPreviewUrl}
                            alt="After"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-neutral-400">
                            <Image className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.caption && (
                    <p className="mb-1 text-sm font-medium text-neutral-800 line-clamp-2">
                      {item.caption}
                    </p>
                  )}

                  {item.category && (
                    <p className="text-xs text-neutral-500">{item.category}</p>
                  )}

                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {item.tags.slice(0, 4).join(", ")}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-neutral-100 pt-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-neutral-400 hover:text-blue-600"
                      title="Edit"
                      onClick={() => openEditModal(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-neutral-400 hover:text-red-600"
                      title="Delete"
                      onClick={() => openDeleteConfirmation(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal (key forces remount so lazy state resets) */}
      {modalOpen && (
        <PortfolioPhotoFormModal
          key={modalItem ? getPortfolioId(modalItem) : "new"}
          open={modalOpen}
          editingItem={modalItem}
          isSaving={isSaving}
          onSaveComplete={handleSaveComplete}
          onClose={closeModal}
        />
      )}

      {deleteTarget && !modalOpen && (
        <ConfirmModal
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          isSubmitting={isDeleting}
          message="Delete this portfolio item? This action soft-deletes it."
          onClose={closeDeleteConfirmation}
          onConfirm={confirmDelete}
          title="Delete portfolio item"
        />
      )}
    </section>
  );
}
