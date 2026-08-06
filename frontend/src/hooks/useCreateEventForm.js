import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";
import {
  buildCreateEventPayload,
  getCreateEventInitialForm,
  getSalonId,
  getSalonLocation,
  validateCreateEventForm,
} from "@/utils/eventFormUtils";

export function useCreateEventForm({ manageableSalons, refreshEvents }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(
    getCreateEventInitialForm(manageableSalons)
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState("");
  const mountedRef = useRef(true);
  const previewRef = useRef("");

  useEffect(() => () => {
    mountedRef.current = false;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const clearImagePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = "";
    }
    setEventImagePreview("");
    setEventImageFile(null);
  }, []);

  const openCreateModal = useCallback(() => {
    setCreateForm(getCreateEventInitialForm(manageableSalons));
    clearImagePreview();
    setCreateError("");
    setShowCreateModal(true);
  }, [clearImagePreview, manageableSalons]);

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setCreateForm(getCreateEventInitialForm(manageableSalons));
    clearImagePreview();
    setCreateError("");
  }, [clearImagePreview, manageableSalons]);

  const handleCreateField = useCallback((field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    setCreateError("");
  }, []);

  const selectCreateSalon = useCallback(
    (salonId) => {
      const selectedSalon =
        manageableSalons.find(
          (salon) => String(getSalonId(salon)) === String(salonId)
        ) || null;

      setCreateForm((prev) => ({
        ...prev,
        salonId,
        locationType: "salon",
        location: selectedSalon ? getSalonLocation(selectedSalon) : "",
      }));
      setCreateError("");
    },
    [manageableSalons]
  );

  const handleEventImageChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCreateError("Event image must be a JPEG, PNG, or WEBP file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCreateError("Event image must be 5MB or smaller");
      return;
    }

    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    previewRef.current = previewUrl;
    setCreateError("");
    setEventImageFile(file);
    setEventImagePreview(previewUrl);
  }, []);

  const handleCreateEvent = useCallback(async () => {
    const validationError = validateCreateEventForm(createForm, manageableSalons);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      await api.post("/events", buildCreateEventPayload(createForm, eventImageFile));
      closeCreateModal();
      void refreshEvents();
    } catch (err) {
      setCreateError(err.response?.data?.message || "Could not create event");
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  }, [closeCreateModal, createForm, eventImageFile, manageableSalons, refreshEvents]);

  return {
    closeCreateModal,
    createError,
    createForm,
    eventImagePreview,
    handleCreateEvent,
    handleCreateField,
    handleEventImageChange,
    isCreating,
    openCreateModal,
    selectCreateSalon,
    setCreateForm,
    setCreateError,
    setEventImageFile,
    setEventImagePreview,
    setIsCreating,
    setShowCreateModal,
    showCreateModal,
  };
}
