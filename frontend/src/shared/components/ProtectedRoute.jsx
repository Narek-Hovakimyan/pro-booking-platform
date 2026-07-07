import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, role, requiredPlatformRole }) {
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

  if (requiredPlatformRole && currentUser?.platformRole !== requiredPlatformRole) {
    return (
      <Navigate
        to={currentUser?.role === "barber" ? "/admin" : "/"}
        replace
      />
    );
  }

  return children;
}
