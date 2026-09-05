import api from "./axios";

export function fetchMyJobApplications() {
  return api.get("/salon-jobs/applications/my-submissions");
}

export function confirmJobOnboarding(applicationId) {
  return api.post(
    `/salon-jobs/applications/${encodeURIComponent(applicationId)}/onboarding/confirm`
  );
}
