import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import {
  canAccessPlatform,
  hasPlatformCapability,
} from "@/shared/utils/platformAccess";

export default function ProtectedRoute({
  children,
  role,
  requiredPlatformRole,
  requiredPlatformCapability,
}) {
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && currentUser?.role !== role) {
    return (
      <Navigate
        to={currentUser?.role === "barber" ? "/admin" : "/"}
        replace
      />
    );
  }

  if (requiredPlatformRole && !canAccessPlatform(currentUser)) {
    return (
      <Navigate
        to={currentUser?.role === "barber" ? "/admin" : "/"}
        replace
      />
    );
  }

  if (
    requiredPlatformCapability &&
    !hasPlatformCapability(currentUser, requiredPlatformCapability)
  ) {
    return (
      <Navigate
        to={currentUser?.role === "barber" ? "/admin" : "/"}
        replace
      />
    );
  }

  return children;
}
