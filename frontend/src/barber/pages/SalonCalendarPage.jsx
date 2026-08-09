import {
  Building2,
  CalendarDays,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getSalonCalendar } from "@/shared/api/salonCalendar";
import StatusBadge from "@/shared/components/StatusBadge";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatDateKey, parseDateKey } from "@/shared/utils/dates";

import SalonCalendarControls from "./salon-calendar/SalonCalendarControls";
import SalonCalendarHeader from "./salon-calendar/SalonCalendarHeader";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getSalonList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
};

const getSalonId = (salon) => getIdString(salon?.salon || salon);

const isSalonOwnerOrAdmin = (salon, userId) => {
  const currentUserId = getIdString(userId);
  const rawSalon = salon?.salon || salon;

  if (!rawSalon || !currentUserId) return false;
  if (getIdString(rawSalon.ownerId) === currentUserId) return true;

  return Array.isArray(rawSalon.admins) &&
    rawSalon.admins.some((adminId) => getIdString(adminId) === currentUserId);
};

const formatDateLabel = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const getWeekLabel = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;

  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
};

const formatPrice = (amount) => `${Number(amount || 0).toLocaleString()} AMD`;

function StatPill({ label, value }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-neutral-950">{value}</div>
    </div>
  );
}

function BookingRow({ booking }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-neutral-950">
            {booking.clientName || "Client"}
          </div>
          <div className="mt-1 text-sm text-neutral-600">
            {booking.serviceName || "Service"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
            <span>{formatDateLabel(booking.date)}</span>
            <span>
              {booking.startTime}
              {booking.endTime ? ` - ${booking.endTime}` : ""}
            </span>
            <span>{booking.duration} min</span>
            <span>{formatPrice(booking.price)}</span>
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge status={booking.status} />
        </div>
      </div>
    </div>
  );
}

export default function SalonCalendarPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const [searchParams] = useSearchParams();
  const initialSalonId = searchParams.get("salonId") || "";
  const initialDateParam = searchParams.get("date");
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState(initialSalonId);
  const [selectedDate, setSelectedDate] = useState(
    parseDateKey(initialDateParam || "")
      ? initialDateParam
      : formatDateKey(new Date())
  );
  const [view, setView] = useState("day");
  const [selectedBarberId, setSelectedBarberId] = useState("");
  const [calendar, setCalendar] = useState(null);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchSalons() {
      setLoadingSalons(true);

      try {
        const { data } = await api.get("/salons/mine/manageable");
        const nextSalons = getSalonList(data).filter((salon) =>
          isSalonOwnerOrAdmin(salon, currentUserId)
        );

        if (!isMounted) return;

        setSalons(nextSalons);
        setSelectedSalonId((currentValue) => {
          if (
            currentValue &&
            nextSalons.some((salon) => getSalonId(salon) === currentValue)
          ) {
            return currentValue;
          }

          if (
            initialSalonId &&
            nextSalons.some((salon) => getSalonId(salon) === initialSalonId)
          ) {
            return initialSalonId;
          }

          return nextSalons[0] ? getSalonId(nextSalons[0]) : "";
        });
        setError("");
      } catch (requestError) {
        if (!isMounted) return;

        setError(
          requestError?.response?.data?.message || "Could not load salons."
        );
      } finally {
        if (isMounted) {
          setLoadingSalons(false);
        }
      }
    }

    fetchSalons();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, initialSalonId]);

  useEffect(() => {
    if (!selectedSalonId) return;

    let isMounted = true;

    async function fetchCalendar() {
      setLoadingCalendar(true);

      try {
        const data = await getSalonCalendar(selectedSalonId, {
          date: selectedDate,
          view,
          barberId: selectedBarberId || undefined,
        });

        if (!isMounted) return;

        setCalendar(data);
        if (
          selectedBarberId &&
          !data.staff.some((member) => member.id === selectedBarberId)
        ) {
          setSelectedBarberId("");
        }
        setError("");
      } catch (requestError) {
        if (!isMounted) return;

        setCalendar(null);
        setError(
          requestError?.response?.data?.message ||
            "Could not load salon calendar."
        );
      } finally {
        if (isMounted) {
          setLoadingCalendar(false);
        }
      }
    }

    fetchCalendar();

    return () => {
      isMounted = false;
    };
  }, [selectedBarberId, selectedDate, selectedSalonId, view]);

  const groupedBookings = useMemo(() => {
    const map = new Map();

    for (const booking of calendar?.bookings || []) {
      const key = booking.barberId || "";
      map.set(key, [...(map.get(key) || []), booking]);
    }

    return map;
  }, [calendar?.bookings]);

  const staffList = calendar?.staff || [];
  const visibleStaff = selectedBarberId
    ? staffList.filter((member) => member.id === selectedBarberId)
    : staffList;

  const periodLabel = view === "week" ? getWeekLabel(selectedDate) : formatDateLabel(selectedDate);

  const handleRefresh = async () => {
    if (!selectedSalonId) return;

    setLoadingCalendar(true);
    try {
      const data = await getSalonCalendar(selectedSalonId, {
        date: selectedDate,
        view,
        barberId: selectedBarberId || undefined,
      });
      setCalendar(data);
      setError("");
    } catch (requestError) {
      setCalendar(null);
      setError(
        requestError?.response?.data?.message || "Could not load salon calendar."
      );
    } finally {
      setLoadingCalendar(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SalonCalendarHeader
        loadingCalendar={loadingCalendar}
        onRefresh={handleRefresh}
        selectedSalonId={selectedSalonId}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingSalons ? (
        <Card>
          <CardContent className="text-sm text-neutral-500">
            Loading salons...
          </CardContent>
        </Card>
      ) : salons.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-neutral-300" />
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">
                  No salon calendar access
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  This page is available only to salon owners and admins.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <SalonCalendarControls
            calendar={calendar}
            onBarberChange={setSelectedBarberId}
            onDateChange={setSelectedDate}
            onSalonChange={(value) => {
              setSelectedSalonId(value);
              setSelectedBarberId("");
            }}
            onViewChange={setView}
            periodLabel={periodLabel}
            salons={salons}
            selectedBarberId={selectedBarberId}
            selectedDate={selectedDate}
            selectedSalonId={selectedSalonId}
            staff={calendar?.staff || []}
            view={view}
          />

          {loadingCalendar ? (
            <Card>
              <CardContent className="text-sm text-neutral-500">
                Loading salon calendar...
              </CardContent>
            </Card>
          ) : !calendar ? (
            <Card>
              <CardContent className="text-sm text-neutral-500">
                No calendar data available.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-neutral-500" />
                    <h2 className="font-semibold text-neutral-950">Summary</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <StatPill
                      label="Total"
                      value={calendar.summary?.totalBookings ?? 0}
                    />
                    <StatPill
                      label="Pending"
                      value={calendar.summary?.pendingCount ?? 0}
                    />
                    <StatPill
                      label="Accepted"
                      value={calendar.summary?.acceptedCount ?? 0}
                    />
                    <StatPill
                      label="Completed"
                      value={calendar.summary?.completedCount ?? 0}
                    />
                    <StatPill
                      label="Cancelled"
                      value={calendar.summary?.cancelledCount ?? 0}
                    />
                    <StatPill
                      label="No-show"
                      value={calendar.summary?.noShowCount ?? 0}
                    />
                  </div>
                </CardContent>
              </Card>

              {calendar.bookings.length === 0 ? (
                <Card>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-8 w-8 text-neutral-300" />
                      <div>
                        <h2 className="text-lg font-semibold text-neutral-950">
                          No bookings in this {view}
                        </h2>
                        <p className="mt-1 text-sm text-neutral-500">
                          Try another date or staff filter.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {visibleStaff.map((member) => {
                    const staffBookings = groupedBookings.get(member.id) || [];

                    return (
                      <Card key={member.id}>
                        <CardContent className="space-y-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              {member.avatarUrl ? (
                                <img
                                  alt={member.name}
                                  className="h-11 w-11 rounded-full object-cover"
                                  src={member.avatarUrl}
                                />
                              ) : (
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100">
                                  <Users className="h-5 w-5 text-neutral-400" />
                                </div>
                              )}
                              <div>
                                <h2 className="font-semibold text-neutral-950">
                                  {member.name}
                                </h2>
                                <p className="text-sm text-neutral-500">
                                  {staffBookings.length} booking
                                  {staffBookings.length === 1 ? "" : "s"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {staffBookings.length === 0 ? (
                            <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
                              No bookings for this staff member in the selected
                              period.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {staffBookings.map((booking) => (
                                <BookingRow booking={booking} key={booking.id} />
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
