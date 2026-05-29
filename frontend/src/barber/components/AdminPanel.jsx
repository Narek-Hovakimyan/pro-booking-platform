import { Suspense, lazy } from "react";
import { useSelector } from "react-redux";

import DashboardAnalytics from "./DashboardAnalytics";

const BookingsList = lazy(() => import("./BookingsList"));
const BarberSettings = lazy(() => import("./BarberSettings"));
const ServicesManager = lazy(() => import("./ServicesManager"));
const ScheduleManager = lazy(() => import("./ScheduleManager"));
const WaitlistView = lazy(() => import("./WaitlistView"));
const SalonJobsManager = lazy(() => import("./SalonJobsManager"));
const PortfolioManager = lazy(() => import("./PortfolioManager"));
const LoyaltyProgramManager = lazy(() => import("./LoyaltyProgramManager"));

export default function AdminPanel({
  bookings,
  services,
  removeService,
  addService,
  updateService,
  schedule,
  isLoading = false,
  isSaving = false,
  error = "",
  section = "dashboard",
}) {
  const { currentUser } = useSelector((state) => state.auth);
  const barberId = currentUser?.id || currentUser?._id;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        {section === "dashboard" && <DashboardAnalytics bookings={bookings} />}

        {(section === "dashboard" || section === "bookings") && (
          <BookingsList
            bookings={bookings}
            error={error}
            isLoading={isLoading}
            services={services}
          />
        )}

        {section === "waitlist" && barberId && (
          <div className="lg:col-span-3">
            <WaitlistView barberId={barberId} />
          </div>
        )}

        {section === "jobs" && <SalonJobsManager />}

        {(section === "dashboard" || section === "services") && (
          <ServicesManager
            services={services}
            removeService={removeService}
            addService={addService}
            updateService={updateService}
            error={error}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )}

        {(section === "dashboard" || section === "schedule") && (
          <ScheduleManager
            schedule={schedule}
            error={error}
            isLoading={isLoading}
          />
        )}

        {section === "portfolio" && (
          <div className="lg:col-span-3">
            <PortfolioManager />
          </div>
        )}

        {section === "loyalty" && (
          <div className="lg:col-span-3">
            <LoyaltyProgramManager />
          </div>
        )}

        {section === "settings" && (
          <BarberSettings
            error={error}
            isLoading={isLoading}
            settingsView="hub"
          />
        )}

        {section === "settings-salon" && (
          <BarberSettings
            error={error}
            isLoading={isLoading}
            settingsView="salon"
          />
        )}

        {section === "settings-default-schedule" && (
          <BarberSettings
            error={error}
            isLoading={isLoading}
            settingsView="default-schedule"
          />
        )}

        {section === "settings-certifications" && (
          <BarberSettings
            error={error}
            isLoading={isLoading}
            settingsView="certifications"
          />
        )}
      </div>
    </Suspense>
  );
}
