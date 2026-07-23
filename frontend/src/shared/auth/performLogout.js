import { logoutUser } from "@/store/slices/authSlice";
import { requestLogoutSession } from "@/shared/api/authSession";

export async function performLogout({
  dispatch,
  navigate,
  onCleanup,
} = {}) {
  try {
    await requestLogoutSession();
  } catch {
    // Local logout must still complete when the backend request fails.
  } finally {
    onCleanup?.();
    dispatch?.(logoutUser());
    navigate?.("/login");
  }
}
