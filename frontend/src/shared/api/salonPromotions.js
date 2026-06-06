import api from "./axios";

export const getSalonPromotions = (salonId) =>
  api.get(`/salons/${salonId}/promotions`);

export const createSalonPromotion = (salonId, data) =>
  api.post(`/salons/${salonId}/promotions`, data);

export const updateSalonPromotion = (salonId, promotionId, data) =>
  api.patch(`/salons/${salonId}/promotions/${promotionId}`, data);

export const validateSalonPromotion = (salonId, data) =>
  api.post(`/salons/${salonId}/promotions/validate`, data);
