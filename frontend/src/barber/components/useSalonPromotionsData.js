import { useCallback, useEffect, useId, useRef, useState } from "react";

import api from "@/shared/api/axios";
import {
  buildPromotionForm,
  buildPromotionPayload,
  createEmptyPromotionForm,
  validatePromotionForm,
} from "./promotionFormHelpers";

const PROMOTION_LOAD_ERROR = "Could not load promotions. Please try again.";
const PROMOTION_SAVE_ERROR = "Could not save promotion.";
const PROMOTION_UPDATE_ERROR = "Could not update promotion.";

function extractMembers(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return data?.members || data?.staff || [];
}

function extractServices(data) {
  if (Array.isArray(data?.services)) {
    return data.services;
  }

  return data?.barbers?.flatMap((barber) => barber.services || []) || [];
}

function mapSelectableOptions(items) {
  return items.length > 0
    ? items
    : [];
}

export default function useSalonPromotionsData({ salonId }) {
  const modalId = useId();
  const dialogRef = useRef(null);
  const createButtonRef = useRef(null);
  const editButtonRefs = useRef(new Map());
  const triggerRef = useRef(null);
  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const refreshRequestIdRef = useRef(0);
  const salonVersionRef = useRef(0);
  const copiedTimerRef = useRef(null);
  const successTimerRef = useRef(null);
  const latestSavingRef = useRef(false);
  const isModalOpenRef = useRef(false);

  const [promotions, setPromotions] = useState([]);
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [form, setForm] = useState(createEmptyPromotionForm);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    latestSavingRef.current = saving;
  }, [saving]);

  useEffect(
    () => () => {
      mountedRef.current = false;

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }

      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    },
    []
  );

  const isCurrentRequest = useCallback((requestId, salonVersion) => {
    return (
      mountedRef.current &&
      requestId === loadRequestIdRef.current &&
      salonVersion === salonVersionRef.current
    );
  }, []);

  const setSuccessMessage = useCallback((message) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    setSuccessMsg(message);
    successTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setSuccessMsg("");
      }
    }, 3000);
  }, []);

  const clearCopiedState = useCallback(() => {
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }

    copiedTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setCopiedId(null);
      }
    }, 2000);
  }, []);

  const copyCode = useCallback(
    async (promotion) => {
      try {
        await navigator.clipboard.writeText(promotion.code);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = promotion.code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      if (!mountedRef.current) {
        return;
      }

      setCopiedId(promotion._id);
      clearCopiedState();
    },
    [clearCopiedState]
  );

  const refreshPromotions = useCallback(async () => {
    if (!salonId) {
      return;
    }

    const requestId = ++refreshRequestIdRef.current;
    const salonVersion = salonVersionRef.current;
    setLoading(true);

    try {
      const response = await api.get(`/salons/${salonId}/promotions`);
      if (
        !mountedRef.current ||
        requestId !== refreshRequestIdRef.current ||
        salonVersion !== salonVersionRef.current
      ) {
        return;
      }

      setPromotions(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch {
      if (
        !mountedRef.current ||
        requestId !== refreshRequestIdRef.current ||
        salonVersion !== salonVersionRef.current
      ) {
        return;
      }

      setError(PROMOTION_LOAD_ERROR);
    } finally {
      if (
        mountedRef.current &&
        requestId === refreshRequestIdRef.current &&
        salonVersion === salonVersionRef.current
      ) {
        setLoading(false);
      }
    }
  }, [salonId]);

  const loadSalonData = useCallback(
    async (requestId, salonVersion) => {
      if (!salonId) {
        return;
      }

      setLoading(true);

      try {
        const promoResponse = await api.get(`/salons/${salonId}/promotions`);
        if (!isCurrentRequest(requestId, salonVersion)) {
          return;
        }

        setPromotions(Array.isArray(promoResponse.data) ? promoResponse.data : []);
        setError("");
      } catch {
        if (!isCurrentRequest(requestId, salonVersion)) {
          return;
        }

        setError(PROMOTION_LOAD_ERROR);
      } finally {
        if (isCurrentRequest(requestId, salonVersion)) {
          setLoading(false);
        }
      }

      if (!isCurrentRequest(requestId, salonVersion)) {
        return;
      }

      try {
        const staffResponse = await api.get(`/salons/${salonId}/staff`);
        if (!isCurrentRequest(requestId, salonVersion)) {
          return;
        }

        setBarbers(extractMembers(staffResponse.data));
      } catch {
        // silently fail
      }

      if (!isCurrentRequest(requestId, salonVersion)) {
        return;
      }

      try {
        const bookingResponse = await api.get(`/salons/${salonId}/public-booking`);
        if (!isCurrentRequest(requestId, salonVersion)) {
          return;
        }

        setServices(extractServices(bookingResponse.data));
      } catch {
        // silently fail
      }
    },
    [isCurrentRequest, salonId]
  );

  useEffect(() => {
    if (!salonId) {
      return undefined;
    }

    mountedRef.current = true;
    const salonVersion = ++salonVersionRef.current;
    const requestId = ++loadRequestIdRef.current;
    void loadSalonData(requestId, salonVersion);

    return () => {
      salonVersionRef.current += 1;
      loadRequestIdRef.current += 1;
    };
  }, [loadSalonData, salonId]);

  const openCreateModal = useCallback(() => {
    triggerRef.current = createButtonRef.current;
    setEditingPromotion(null);
    setForm(createEmptyPromotionForm());
    setModalError("");
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((promotion) => {
    triggerRef.current = editButtonRefs.current.get(String(promotion._id));
    setEditingPromotion(promotion);
    setForm(buildPromotionForm(promotion));
    setModalError("");
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingPromotion(null);
    setForm(createEmptyPromotionForm());
    setModalError("");
  }, []);

  const handleField = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleToggleService = useCallback((serviceId) => {
    setForm((current) => {
      const currentIds = current.applicableServiceIds || [];
      const strId = String(serviceId);
      const exists = currentIds.some((id) => String(id) === strId);

      return {
        ...current,
        applicableServiceIds: exists
          ? currentIds.filter((id) => String(id) !== strId)
          : [...currentIds, serviceId],
      };
    });
  }, []);

  const handleToggleBarber = useCallback((barberId) => {
    setForm((current) => {
      const currentIds = current.applicableBarberIds || [];
      const strId = String(barberId);
      const exists = currentIds.some((id) => String(id) === strId);

      return {
        ...current,
        applicableBarberIds: exists
          ? currentIds.filter((id) => String(id) !== strId)
          : [...currentIds, barberId],
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    const validationError = validatePromotionForm(form);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    const payload = buildPromotionPayload(form, Boolean(editingPromotion));
    setSaving(true);
    setModalError("");

    try {
      if (editingPromotion) {
        await api.patch(`/salons/${salonId}/promotions/${editingPromotion._id}`, payload);
        setSuccessMessage("Promotion updated successfully.");
      } else {
        await api.post(`/salons/${salonId}/promotions`, payload);
        setSuccessMessage("Promotion created successfully.");
      }

      closeModal();
      void refreshPromotions();
    } catch (err) {
      const message = err.response?.data?.message || PROMOTION_SAVE_ERROR;
      setModalError(message);
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [closeModal, editingPromotion, form, refreshPromotions, salonId, setSuccessMessage]);

  const handleToggleActive = useCallback(
    async (promotion) => {
      try {
        await api.patch(`/salons/${salonId}/promotions/${promotion._id}`, {
          active: !promotion.active,
        });

        setSuccessMessage(
          promotion.active ? "Promotion deactivated." : "Promotion activated."
        );
        void refreshPromotions();
      } catch (err) {
        const message = err.response?.data?.message || PROMOTION_UPDATE_ERROR;
        setError(message);
      }
    },
    [refreshPromotions, salonId, setSuccessMessage]
  );

  const uniqueServices = mapSelectableOptions(
    services.length > 0
      ? services
      : [
          ...new Map(
            promotions
              .flatMap((promotion) => promotion.applicableServiceIds || [])
              .map((service) => [String(service._id || service), service])
          ).values(),
        ]
  );

  const uniqueBarbers = mapSelectableOptions(
    barbers.length > 0
      ? barbers
      : [
          ...new Map(
            promotions
              .flatMap((promotion) => promotion.applicableBarberIds || [])
              .map((barber) => [String(barber._id || barber), barber])
          ).values(),
        ]
  );

  return {
    closeModal,
    copyCode,
    copiedId,
    createButtonRef,
    dialogRef,
    editingPromotion,
    error,
    form,
    handleField,
    handleSave,
    handleToggleActive,
    handleToggleBarber,
    handleToggleService,
    isModalOpenRef,
    latestSavingRef,
    loading,
    modalError,
    modalId,
    openCreateModal,
    openEditModal,
    promotions,
    refreshPromotions,
    showModal,
    successMsg,
    triggerRef,
    uniqueBarbers,
    uniqueServices,
    editButtonRefs,
  };
}
