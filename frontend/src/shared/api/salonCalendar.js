import api from "@/shared/api/axios";

export async function getSalonCalendar(salonId, params = {}) {
  const { data } = await api.get(`/salons/${salonId}/calendar`, { params });
  return data;
}
