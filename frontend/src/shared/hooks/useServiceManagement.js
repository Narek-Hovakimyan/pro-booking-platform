import { useCallback } from "react";

import api from "../api/axios";
import { getFriendlyApiError } from "../api/errors";
import {
  addService as addServiceAction,
  removeService,
  updateService as updateServiceAction,
} from "../../store/slices/servicesSlice";

export function useServiceManagement({
  currentUserId,
  dispatch,
  newService,
  setNewService,
  setDataError,
  setIsSaving,
}) {
  const addService = useCallback(async (serviceData) => {
    const name = serviceData?.name || newService.name;
    const price = serviceData?.price ?? newService.price;
    const duration = serviceData?.duration ?? newService.duration;
    const description = serviceData?.description || "";
    const category = serviceData?.category || "other";
    const tags = Array.isArray(serviceData?.tags) ? serviceData.tags : [];
    const type = serviceData?.type || "single";
    const packagePriceMode = serviceData?.packagePriceMode;
    const packageDurationMode = serviceData?.packageDurationMode;
    const isSumPrice = type === "package" && packagePriceMode === "sum";
    const isSumDuration = type === "package" && packageDurationMode === "sum";

    const serviceDuration = Number(duration);

    if (!currentUserId || !name) return;

    // Validate price: required for single services and manual-mode packages
    if (!isSumPrice && (!price || !Number.isFinite(Number(price)) || Number(price) < 0)) {
      return;
    }

    // Validate duration: required for single services and manual-mode packages
    if (!isSumDuration && (!Number.isFinite(serviceDuration) || serviceDuration <= 0)) {
      return;
    }

    setIsSaving(true);
    setDataError("");

    try {
      const payload = {
        barberId: currentUserId,
        name,
        description,
        category,
        tags,
        type,
        active: true,
      };

      // Only include price when not auto-calculated via sum mode
      if (!isSumPrice) {
        payload.price = Number(price);
      }

      // Only include duration when not auto-calculated via sum mode
      if (!isSumDuration) {
        payload.duration = serviceDuration;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          serviceData || {},
          "customCategoryId"
        )
      ) {
        payload.customCategoryId = serviceData.customCategoryId;
      }

      if (type === "package") {
        payload.includedServiceIds = serviceData.includedServiceIds;
        payload.packagePriceMode = serviceData.packagePriceMode;
        payload.packageDurationMode = serviceData.packageDurationMode;
      }

      const { data } = await api.post("/services", payload);

      dispatch(addServiceAction(data));

      setNewService({
        name: "",
        price: "",
        duration: "",
      });
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not save service. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }, [currentUserId, dispatch, newService, setNewService, setDataError, setIsSaving]);

  const updateService = useCallback(async (serviceId, serviceData) => {
    setIsSaving(true);
    setDataError("");

    try {
      const { data } = await api.put(`/services/${serviceId}`, serviceData);

      dispatch(updateServiceAction(data));
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not update service. Please try again."
        )
      );
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  }, [dispatch, setDataError, setIsSaving]);

  const deleteService = useCallback(async (serviceId) => {
    setIsSaving(true);
    setDataError("");

    try {
      await api.delete(`/services/${serviceId}`);
      dispatch(removeService(serviceId));
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not delete service. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }, [dispatch, setDataError, setIsSaving]);

  return {
    addService,
    updateService,
    deleteService,
  };
}