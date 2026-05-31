import {
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import AttendanceModal from "@/features/events/components/AttendanceModal";
import CertificateIssueModal from "@/features/events/components/CertificateIssueModal";
import CertificateRevokeModal from "@/features/events/components/CertificateRevokeModal";
import CreateEventModal from "@/features/events/components/CreateEventModal";
import EventCard from "@/features/events/components/EventCard";
import EventDetailModal from "@/features/events/components/EventDetailModal";
import EventFiltersDrawer from "@/features/events/components/EventFiltersDrawer";
import RejectRegistrationModal from "@/features/events/components/RejectRegistrationModal";
import {
  EVENT_TYPE_LABELS,
  getEventType,
  getRegistrationEventId,
  getRegistrationReason,
  getRegistrationStatus,
  isEventEnded,
} from "@/features/events/utils/eventFormatters";

const emptyForm = {
  title: "",
  description: "",
  type: "training",
  instructor: "",
  instructorBio: "",
  date: "",
  time: "",
  duration: "",
  price: "",
  maxParticipants: "20",
  location: "",
  locationType: "salon",
  salonId: "",
  imageUrl: "",
  visibility: "public",
  certificatesEnabled: false,
};

const normalizeSalonList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.salons) ? data.salons : [];

const getSalonId = (salon) => salon?._id || salon?.id || "";
const getSalonAddress = (salon) => salon?.address || "";
const getSalonLocation = (salon) => getSalonAddress(salon) || salon?.name || "";

export default function EventsPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [salons, setSalons] = useState([]);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterSalonId, setFilterSalonId] = useState("");
  const [filterPrice, setFilterPrice] = useState("");
  const [filterType, setFilterType] = useState("");

  // Create event state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [myOwnedSalons, setMyOwnedSalons] = useState([]);
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState("");

  // Attendance management state
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceRegistrations, setAttendanceRegistrations] = useState([]);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [certificatesMessage, setCertificatesMessage] = useState("");
  const [eventRegistrations, setEventRegistrations] = useState([]);
  const [isRegistrationsLoading, setIsRegistrationsLoading] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [isUpdatingRegistration, setIsUpdatingRegistration] = useState(false);
  const [registeringEventId, setRegisteringEventId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [registrationToReject, setRegistrationToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [revokingCertificate, setRevokingCertificate] = useState(null);
  const [revokedReason, setRevokedReason] = useState("");

  const isBarber = currentUser?.role === "barber";
  const currentUserId = currentUser?._id || currentUser?.id || "";

  // Fetch events
  const fetchEvents = useCallback(async (searchTerm, salonFilter) => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: "upcoming" });
      if (searchTerm) params.append("search", searchTerm);
      if (salonFilter) params.append("salonId", salonFilter);

      const { data } = await api.get(`/events?${params}`);
      setEvents(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch salons for filter
  useEffect(() => {
    async function fetchSalons() {
      try {
        const { data } = await api.get("/salons");
        const allSalons = Array.isArray(data) ? data : [];
        setSalons(allSalons);
      } catch {
        // ignore
      }
    }
    fetchSalons();
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return undefined;
    }

    let isMounted = true;

    async function fetchManageableSalons() {
      try {
        const { data } = await api.get("/salons/mine/manageable");
        if (!isMounted) return;

        setMyOwnedSalons(normalizeSalonList(data));
      } catch {
        if (isMounted) {
          setMyOwnedSalons([]);
        }
      }
    }

    void fetchManageableSalons();

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  const refreshMyRegistrations = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data } = await api.get("/events/my-registrations");
      setMyRegistrations(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;

    async function loadMyRegistrations() {
      try {
        const { data } = await api.get("/events/my-registrations");
        if (isMounted) {
          setMyRegistrations(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      }
    }

    void loadMyRegistrations();

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  // Fetch events when search/filters change
  useEffect(() => {
    let isMounted = true;
    async function loadEvents() {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ status: "upcoming" });
        if (search) params.append("search", search);
        if (filterSalonId) params.append("salonId", filterSalonId);
        const { data } = await api.get(`/events?${params}`);
        if (isMounted) setEvents(data);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.message || "Could not load events");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadEvents();
    return () => { isMounted = false; };
  }, [search, filterSalonId]);

  const canCreateEvents = Boolean(currentUserId && myOwnedSalons.length > 0);

  const myRegistrationsByEventId = useMemo(() => {
    const registrationsByEventId = new Map();

    for (const registration of myRegistrations || []) {
      const eventId = getRegistrationEventId(registration);
      if (!eventId) continue;

      registrationsByEventId.set(String(eventId), registration);
    }

    return registrationsByEventId;
  }, [myRegistrations]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (filterPrice === "free") {
      result = result.filter((e) => !e.price || e.price === 0);
    } else if (filterPrice === "paid") {
      result = result.filter((e) => e.price && e.price > 0);
    }
    if (filterType) {
      result = result.filter((event) => getEventType(event) === filterType);
    }
    return result;
  }, [events, filterPrice, filterType]);

  const resetFilters = () => {
    setSearch("");
    setFilterSalonId("");
    setFilterPrice("");
    setFilterType("");
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(filterSalonId) ||
    Boolean(filterPrice) ||
    Boolean(filterType);
  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (filterSalonId ? 1 : 0) +
    (filterPrice ? 1 : 0) +
    (filterType ? 1 : 0);
  const filterChips = [
    search.trim()
      ? { label: `Search: ${search.trim()}`, onRemove: () => setSearch("") }
      : null,
    filterSalonId
      ? {
          label: `Salon: ${salons.find((s) => s._id === filterSalonId)?.name || filterSalonId}`,
          onRemove: () => setFilterSalonId(""),
        }
      : null,
    filterPrice
      ? {
          label: `Price: ${filterPrice}`,
          onRemove: () => setFilterPrice(""),
        }
      : null,
    filterType
      ? {
          label: `Type: ${EVENT_TYPE_LABELS[filterType] || filterType}`,
          onRemove: () => setFilterType(""),
        }
      : null,
  ].filter(Boolean);

  const canManageEvent = useCallback(
    (event) =>
      Boolean(
        event &&
          currentUser &&
          (String(event?.organizerId?._id || event?.organizerId) ===
            String(currentUserId) ||
            myOwnedSalons.some(
              (salon) =>
                String(salon?._id || salon?.id) ===
                String(event?.salonId?._id || event?.salonId)
            ))
      ),
    [currentUser, currentUserId, myOwnedSalons]
  );

  const syncEventRegistrationCount = useCallback((eventId, registrationCount) => {
    setEvents((prev) =>
      prev.map((event) =>
        event._id === eventId ? { ...event, registrationCount } : event
      )
    );
    setSelectedEvent((prev) =>
      prev && prev._id === eventId ? { ...prev, registrationCount } : prev
    );
  }, []);

  const fetchEventRegistrations = useCallback(async (eventId) => {
    setIsRegistrationsLoading(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.get(`/events/${eventId}/registrations`);
      setEventRegistrations(Array.isArray(data) ? data : []);
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not load registration requests"
      );
      setEventRegistrations([]);
    } finally {
      setIsRegistrationsLoading(false);
    }
  }, []);

  const handleRegister = async (eventId) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    setError("");
    setRegisteringEventId(eventId);

    try {
      const { data } = await api.post(`/events/${eventId}/register`);
      syncEventRegistrationCount(eventId, data.registrationCount);
      await refreshMyRegistrations();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to register for event"
      );
    } finally {
      setRegisteringEventId(null);
    }
  };

  const handleUnregister = async (eventId) => {
    try {
      const { data } = await api.delete(`/events/${eventId}/register`);
      syncEventRegistrationCount(eventId, data.registrationCount);
      await refreshMyRegistrations();
    } catch (err) {
      alert(err.response?.data?.message || "Could not cancel registration");
    }
  };

  const openDetail = async (event) => {
    setIsDetailLoading(true);
    setRegistrationMessage("");
    setEventRegistrations([]);
    setSelectedEvent(event);
    try {
      const { data } = await api.get(`/events/${event._id}`);
      setSelectedEvent(data);
      if (canManageEvent(data)) {
        await fetchEventRegistrations(data._id);
      }
    } catch {
      // keep basic info
    } finally {
      setIsDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedEvent(null);
    setRegistrationMessage("");
    setEventRegistrations([]);
  };

  useEffect(() => {
    if (!isFilterDrawerOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsFilterDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFilterDrawerOpen]);

  const handleApproveRegistration = async (eventId, registrationId) => {
    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.patch(
        `/events/${eventId}/registrations/${registrationId}/approve`
      );
      syncEventRegistrationCount(eventId, data.registrationCount);
      await fetchEventRegistrations(eventId);
      setRegistrationMessage(data.message || "Registration approved");
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not approve registration"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const handleWaitlistRegistration = async (eventId, registrationId) => {
    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.patch(
        `/events/${eventId}/registrations/${registrationId}/waitlist`
      );
      syncEventRegistrationCount(eventId, data.registrationCount);
      await fetchEventRegistrations(eventId);
      setRegistrationMessage(data.message || "Registration moved to waiting list");
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not move registration to waitlist"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const openRejectRegistrationModal = (registration) => {
    setRegistrationToReject(registration);
    setRejectionReason(registration?.rejectionReason || "");
    setShowRejectModal(true);
  };

  const closeRejectRegistrationModal = () => {
    setShowRejectModal(false);
    setRegistrationToReject(null);
    setRejectionReason("");
  };

  const handleRejectRegistration = async () => {
    if (!selectedEvent?._id || !registrationToReject?._id) return;

    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.patch(
        `/events/${selectedEvent._id}/registrations/${registrationToReject._id}/reject`,
        { rejectionReason }
      );
      syncEventRegistrationCount(selectedEvent._id, data.registrationCount);
      await fetchEventRegistrations(selectedEvent._id);
      setRegistrationMessage(data.message || "Registration rejected");
      closeRejectRegistrationModal();
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not reject registration"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const handleCheckInRegistration = async (eventId, registrationId) => {
    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.patch(
        `/events/${eventId}/registrations/${registrationId}/check-in`
      );
      await fetchEventRegistrations(eventId);
      setRegistrationMessage(data.message || "Participant checked in");
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not check in participant"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const [certificateModal, setCertificateModal] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);

  const openCertificateModal = (eventId, registrationId) => {
    setCertificateFile(null);
    setCertificateModal({ eventId, registrationId, mode: "auto" });
  };

  const closeCertificateModal = () => {
    setCertificateModal(null);
    setCertificateFile(null);
  };

  const handleIssueCertificateUpload = async () => {
    if (!certificateModal) return;

    const { eventId, registrationId, mode } = certificateModal;
    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      if (mode === "auto") {
        const { data } = await api.post(
          `/events/${eventId}/registrations/${registrationId}/certificate`
        );
        await fetchEventRegistrations(eventId);
        setRegistrationMessage(data.message || "Certificate issued");
      } else {
        const formData = new FormData();
        formData.append("certificateFile", certificateFile);

        const { data } = await api.post(
          `/events/${eventId}/registrations/${registrationId}/certificate/upload`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        await fetchEventRegistrations(eventId);
        setRegistrationMessage(data.message || "Certificate issued with uploaded file");
      }
      closeCertificateModal();
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not issue certificate"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  const closeRevokeCertificateModal = () => {
    setRevokingCertificate(null);
    setRevokedReason("");
  };

  const handleRevokeCertificate = async () => {
    if (!selectedEvent?._id || !revokingCertificate?.certificateId) return;

    setIsUpdatingRegistration(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.patch(
        `/certificates/${revokingCertificate.certificateId}/revoke`,
        { revokedReason }
      );
      await fetchEventRegistrations(selectedEvent._id);
      setRegistrationMessage(data.message || "Certificate revoked");
      closeRevokeCertificateModal();
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not revoke certificate"
      );
    } finally {
      setIsUpdatingRegistration(false);
    }
  };

  // Create event handlers
  const openCreateModal = () => {
    const singleSalon =
      myOwnedSalons.length === 1 ? myOwnedSalons[0] : null;
    setCreateForm({
      ...emptyForm,
      salonId: singleSalon ? getSalonId(singleSalon) : "",
      location: singleSalon ? getSalonLocation(singleSalon) : "",
    });
    setEventImageFile(null);
    setEventImagePreview("");
    setCreateError("");
    setShowCreateModal(true);
  };

  const handleCreateField = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    // Clear general error when user changes any field
    setCreateError("");
  };

  const selectCreateSalon = (salonId) => {
    const selectedSalon =
      myOwnedSalons.find((salon) => String(getSalonId(salon)) === String(salonId)) ||
      null;

    setCreateForm((prev) => ({
      ...prev,
      salonId,
      locationType: "salon",
      location: selectedSalon ? getSalonLocation(selectedSalon) : "",
    }));
    setCreateError("");
  };

  const handleEventImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCreateError("Event image must be a JPEG, PNG, or WEBP file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCreateError("Event image must be 5MB or smaller");
      return;
    }

    if (eventImagePreview) {
      URL.revokeObjectURL(eventImagePreview);
    }

    setCreateError("");
    setEventImageFile(file);
    setEventImagePreview(URL.createObjectURL(file));
  };

  const handleCreateEvent = async () => {
    const { title, instructor, date, time, duration, location, salonId, locationType } =
      createForm;
    const isSalonLocation = locationType === "salon";

    // Common required fields
    if (!title || !instructor || !date || !time || !duration) {
      setCreateError("Please fill in all required fields");
      return;
    }

    // Location-specific validation
    if (isSalonLocation) {
      if (myOwnedSalons.length > 0 && !salonId) {
        setCreateError("Please select a salon");
        return;
      }
    } else {
      // "other" location requires manual location text
      if (!location) {
        setCreateError("Please enter the venue / location");
        return;
      }
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      setCreateError("Time must be in HH:mm format (e.g., 09:30, 14:00)");
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      if (eventImageFile) {
        const formData = new FormData();
        Object.entries({
          ...createForm,
          duration: Number(createForm.duration),
          price: Number(createForm.price) || 0,
          maxParticipants: Number(createForm.maxParticipants) || 20,
        }).forEach(([key, value]) => {
          formData.append(key, value ?? "");
        });
        formData.append("eventImage", eventImageFile);
        await api.post("/events", formData);
      } else {
        await api.post("/events", {
          ...createForm,
          duration: Number(createForm.duration),
          price: Number(createForm.price) || 0,
          maxParticipants: Number(createForm.maxParticipants) || 20,
        });
      }
      setShowCreateModal(false);
      setCreateForm({ ...emptyForm });
      if (eventImagePreview) {
        URL.revokeObjectURL(eventImagePreview);
      }
      setEventImageFile(null);
      setEventImagePreview("");
      fetchEvents(search, filterSalonId);
    } catch (err) {
      setCreateError(
        err.response?.data?.message || "Could not create event"
      );
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (eventImagePreview) {
        URL.revokeObjectURL(eventImagePreview);
      }
    };
  }, [eventImagePreview]);

  // Attendance management handlers
  const fetchAttendanceRegistrations = async (eventId) => {
    setIsAttendanceLoading(true);
    setAttendanceMessage("");
    setCertificatesMessage("");
    try {
      const { data } = await api.get(`/events/${eventId}/registrations`);
      setAttendanceRegistrations(
        (Array.isArray(data) ? data : []).filter(
          (registration) => registration?.status === "approved"
        )
      );
    } catch (err) {
      setAttendanceMessage(
        err.response?.data?.message || "Could not load registrations"
      );
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  const handleAttendanceChange = (barberId, status) => {
    setAttendanceRegistrations((prev) =>
      prev.map((r) =>
        r.barberId === barberId
          ? { ...r, attendanceStatus: status }
          : r
      )
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedEvent) return;
    setIsSavingAttendance(true);
    setAttendanceMessage("");
    try {
      const payload = attendanceRegistrations.map((r) => ({
        barberId: r.barberId,
        attendanceStatus: r.attendanceStatus,
      }));
      const { data } = await api.put(
        `/events/${selectedEvent._id}/attendance`,
        { registrations: payload }
      );
      setAttendanceMessage(data.message || "Attendance saved");
    } catch (err) {
      setAttendanceMessage(
        err.response?.data?.message || "Could not save attendance"
      );
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const selectedEventRegistration = selectedEvent
    ? myRegistrationsByEventId.get(String(selectedEvent._id)) || null
    : null;
  const selectedEventRegistrationStatus =
    getRegistrationStatus(selectedEventRegistration);
  const selectedEventRejectionReason =
    getRegistrationReason(selectedEventRegistration);
  const canManageSelectedEvent = canManageEvent(selectedEvent);
  const pendingRegistrationRequests = eventRegistrations.filter(
    (registration) => registration?.status === "pending"
  );
  const groupedEventRegistrations = [
    { key: "pending", label: "Pending requests" },
    { key: "approved", label: "Approved participants" },
    { key: "waitlisted", label: "Waitlisted" },
    { key: "rejected", label: "Rejected" },
    { key: "cancelled", label: "Cancelled" },
  ].map((group) => ({
    ...group,
    items: eventRegistrations.filter(
      (registration) => registration?.status === group.key
    ),
  }));
  const selectedEventHasCertificates = Boolean(
    selectedEvent?.certificatesEnabled
  );
  const selectedEventEnded = isEventEnded(selectedEvent);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Events & Seminars</h1>
        <div className="flex gap-2">
          <Button
            className="relative"
            onClick={() => setIsFilterDrawerOpen(true)}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button onClick={resetFilters} variant="outline">
              Clear Filters
            </Button>
          )}
          {canCreateEvents && (
            <Button onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          )}
          {isBarber && (
            <Button variant="outline" onClick={() => navigate("/my-events")}>
              My Events
            </Button>
          )}
        </div>
      </div>

      <EventFiltersDrawer
        activeFiltersCount={activeFiltersCount}
        filterChips={filterChips}
        filterPrice={filterPrice}
        filterSalonId={filterSalonId}
        filterType={filterType}
        isOpen={isFilterDrawerOpen}
        onApply={() => setIsFilterDrawerOpen(false)}
        onClear={resetFilters}
        onClose={() => setIsFilterDrawerOpen(false)}
        salons={salons}
        search={search}
        setFilterPrice={setFilterPrice}
        setFilterSalonId={setFilterSalonId}
        setFilterType={setFilterType}
        setSearch={setSearch}
      />

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-neutral-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Events Grid */}
      {!isLoading && filteredEvents.length === 0 && (
        <EmptyState
          description={
            hasActiveFilters ? "No events match your filters" : "No events yet"
          }
          title="No upcoming events"
        />
      )}

      {!isLoading && filteredEvents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => {
            const registration =
              myRegistrationsByEventId.get(String(event._id)) || null;

            return (
              <EventCard
                canManage={canManageEvent(event)}
                currentUser={currentUser}
                currentUserId={currentUserId}
                event={event}
                key={event._id}
                onOpen={openDetail}
                onRegister={handleRegister}
                onUnregister={handleUnregister}
                registeringEventId={registeringEventId}
                registration={registration}
              />
            );
          })}
        </div>
      )}

      <EventDetailModal
        event={selectedEvent}
        isDetailLoading={isDetailLoading}
        currentUser={currentUser}
        currentUserId={currentUserId}
        registration={selectedEventRegistration}
        registrationStatus={selectedEventRegistrationStatus}
        rejectionReason={selectedEventRejectionReason}
        canManage={canManageSelectedEvent}
        eventRegistrations={eventRegistrations}
        groupedRegistrations={groupedEventRegistrations}
        isRegistrationsLoading={isRegistrationsLoading}
        registrationMessage={registrationMessage}
        isUpdatingRegistration={isUpdatingRegistration}
        registeringEventId={registeringEventId}
        pendingCount={pendingRegistrationRequests.length}
        hasCertificates={selectedEventHasCertificates}
        eventEnded={selectedEventEnded}
        onClose={closeDetailModal}
        onRegister={handleRegister}
        onUnregister={handleUnregister}
        onApprove={handleApproveRegistration}
        onReject={openRejectRegistrationModal}
        onMoveToWaitlist={handleWaitlistRegistration}
        onCheckIn={handleCheckInRegistration}
        onIssueCertificate={openCertificateModal}
        onRevokeCertificate={(certificate) => {
          setRevokingCertificate(certificate);
          setRevokedReason("");
        }}
        onManageAttendance={() => {
          setShowAttendanceModal(true);
          fetchAttendanceRegistrations(selectedEvent._id);
        }}
      />

      <RejectRegistrationModal
        isOpen={showRejectModal}
        registrationToReject={registrationToReject}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        isUpdatingRegistration={isUpdatingRegistration}
        onClose={closeRejectRegistrationModal}
        onSubmit={handleRejectRegistration}
      />

      <CertificateRevokeModal
        isOpen={Boolean(revokingCertificate)}
        onClose={closeRevokeCertificateModal}
        certificateId={revokingCertificate?.certificateId}
        revokeReason={revokedReason}
        setRevokeReason={setRevokedReason}
        onSubmit={handleRevokeCertificate}
        isSubmitting={isUpdatingRegistration}
      />

      <CertificateIssueModal
        isOpen={Boolean(certificateModal)}
        onClose={closeCertificateModal}
        certificateMode={certificateModal?.mode || "auto"}
        setCertificateMode={(mode) => {
          if (mode === "auto") {
            setCertificateFile(null);
          }
          setCertificateModal(prev => prev ? { ...prev, mode } : null);
        }}
        certificateFile={certificateFile}
        onFileChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setCertificateFile(file);
        }}
        onSubmit={handleIssueCertificateUpload}
        isSubmitting={isUpdatingRegistration}
      />

      <AttendanceModal
        isOpen={showAttendanceModal}
        selectedEvent={selectedEvent}
        attendanceMessage={attendanceMessage}
        certificatesMessage={certificatesMessage}
        isAttendanceLoading={isAttendanceLoading}
        attendanceRegistrations={attendanceRegistrations}
        isSavingAttendance={isSavingAttendance}
        onClose={() => setShowAttendanceModal(false)}
        onAttendanceChange={handleAttendanceChange}
        onSaveAttendance={handleSaveAttendance}
      />

      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        eventForm={createForm}
        onFieldChange={handleCreateField}
        validationErrors={createError}
        manageableSalons={myOwnedSalons}
        imagePreview={eventImagePreview}
        isSubmitting={isCreating}
        onSubmit={handleCreateEvent}
        onFileChange={handleEventImageChange}
        onSalonSelect={selectCreateSalon}
      />
    </div>
  );
}
