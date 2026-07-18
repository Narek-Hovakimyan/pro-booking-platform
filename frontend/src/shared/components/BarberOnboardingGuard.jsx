/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { getMyBarberOnboardingDeduped } from "@/shared/api/barberOnboarding";
import {
  getBarberOnboardingRedirect,
  isRequiredOnboardingRoute,
} from "@/shared/utils/barberOnboardingRoutes";
import { Card, CardContent } from "@/shared/components/ui/card";

const BarberOnboardingContext = createContext({
  status: null,
  isRequiredStep: false,
});

export const useBarberOnboardingGuard = () => useContext(BarberOnboardingContext);

export default function BarberOnboardingGuard({ children }) {
  const location = useLocation();
  const { currentUser } = useSelector((state) => state.auth);
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState(null);
  const [checkedPath, setCheckedPath] = useState("");
  const [failedOpen, setFailedOpen] = useState(false);

  useEffect(() => {
    if (currentUser?.role !== "barber") {
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    getMyBarberOnboardingDeduped()
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setStatus(data);
        setFailedOpen(false);
        setCheckedPath(location.pathname);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setFailedOpen(true);
        setCheckedPath(location.pathname);
      });

    return () => {
      requestIdRef.current += 1;
    };
  }, [currentUser?.role, location.pathname]);

  const contextValue = useMemo(
    () => ({
      status,
      isRequiredStep: isRequiredOnboardingRoute(location.pathname, status),
    }),
    [location.pathname, status]
  );

  if (currentUser?.role !== "barber" || (failedOpen && checkedPath === location.pathname)) {
    return children;
  }

  const isLoading = checkedPath !== location.pathname;
  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-neutral-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking onboarding status...
        </CardContent>
      </Card>
    );
  }

  const redirectPath = getBarberOnboardingRedirect(location.pathname, status);
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <BarberOnboardingContext.Provider value={contextValue}>
      {children}
    </BarberOnboardingContext.Provider>
  );
}
