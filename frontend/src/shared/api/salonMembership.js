import api from "./axios";

/**
 * Centralized API module for salon membership operations.
 * All calls return the axios promise for caller error handling.
 */

export function fetchMySalonStatus() {
  return api.get("/salons/me/status");
}

export function fetchSalons(barberId, search = "") {
  const params = barberId ? { excludeForBarber: barberId } : {};
  const term = typeof search === "string" ? search.trim() : "";

  if (term) params.search = term;
  return api.get("/salons", { params });
}

export function fetchOwnerRequests() {
  return api.get("/salons/owner/requests");
}

export function requestJoinSalon(salonId) {
  return api.post(`/salons/${salonId}/join-requests`);
}

export function cancelJoinRequestBySalon(salonId) {
  return api.put(`/salons/join-requests/by-salon/${salonId}/cancel`);
}

export function decideJoinRequest(requestId, status) {
  return api.put(`/salons/join-requests/${requestId}`, { status });
}

export function leaveSalon(salonId) {
  return api.patch("/salons/leave", { salonId });
}
