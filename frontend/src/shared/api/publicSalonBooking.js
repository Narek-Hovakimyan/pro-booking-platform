import api from "./axios";

/**
 * Fetch public salon booking data (salon info, approved+paid barbers, their services).
 * GET /api/salons/:salonId/public-booking
 */
export async function getPublicSalonBooking(salonId) {
  const { data } = await api.get(`/salons/${salonId}/public-booking`);
  return data;
}
