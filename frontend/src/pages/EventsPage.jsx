import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import CertificateIssueModal from "@/features/events/components/CertificateIssueModal";
import CertificateRevokeModal from "@/features/events/components/CertificateRevokeModal";
import CreateEventModal from "@/features/events/components/CreateEventModal";
import EventRegistrationManager from "@/features/events/components/EventRegistrationManager";
import EventCard from "@/features/events/components/EventCard";
import EventFiltersDrawer from "@/features/events/components/EventFiltersDrawer";
import {
  EVENT_TYPE_LABELS,
  formatEventDate as formatDate,
  formatEventDuration as formatDuration,
  formatEventPrice as formatPrice,
  getEventDate,
  getEventImage,
  getEventLocation,
  getEventMaxParticipants,
  getEventOrganizerName,
  getEventRegistrationCount,
  getEventSalonName,
  getEventTime,
  getEventTitle,
  getEventType,
  getEventTypeLabel,
  getEventVisibility,
  getRegistrationEventId,
  getRegistrationReason,
  getRegistrationStatus,
  getRegistrationStatusClasses,
  getRegistrationStatusLabel,
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

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDetailModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">{getEventTitle(selectedEvent)}</h2>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                    {getEventTypeLabel(selectedEvent)}
                  </span>
                  {getEventVisibility(selectedEvent) === "private" &&
                    canManageSelectedEvent && (
                      <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                        Private
                      </span>
                    )}
                  {selectedEventHasCertificates && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Certificates enabled
                    </span>
                  )}
                </div>
                {selectedEvent?.reviewsCount > 0 ? (
                  <p className="mt-1 text-sm text-neutral-500">
                    {Number(selectedEvent.averageRating || 0).toFixed(1)} average rating ·{" "}
                    {selectedEvent.reviewsCount} reviews
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-neutral-500">No event reviews yet</p>
                )}
              </div>
              <button
                className="rounded-full p-1 hover:bg-neutral-100"
                onClick={closeDetailModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isDetailLoading ? (
              <p className="mt-4 text-neutral-500">Loading details...</p>
            ) : (
              <>
                {getEventImage(selectedEvent) && (
                  <img
                    alt={getEventTitle(selectedEvent)}
                    className="mt-4 h-48 w-full rounded-xl object-cover"
                    src={getEventImage(selectedEvent)}
                  />
                )}

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-neutral-600">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(getEventDate(selectedEvent))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600">
                    <Clock className="h-4 w-4" />
                    <span>
                      {getEventTime(selectedEvent)} ·{" "}
                      {formatDuration(selectedEvent.duration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600">
                    <MapPin className="h-4 w-4" />
                    <span>{getEventLocation(selectedEvent)}</span>
                  </div>
                  {(getEventSalonName(selectedEvent) ||
                    getEventOrganizerName(selectedEvent)) && (
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <span>
                        Organized by:{" "}
                        {getEventSalonName(selectedEvent) ||
                          getEventOrganizerName(selectedEvent)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-neutral-600">
                    <Users className="h-4 w-4" />
                    <span>
                      {getEventRegistrationCount(selectedEvent)} /{" "}
                      {getEventMaxParticipants(selectedEvent) || "?"} approved
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-neutral-50 p-4">
                  <p className="font-semibold text-neutral-900">
                    Instructor: {selectedEvent.instructor}
                  </p>
                  {selectedEvent.instructorBio && (
                    <p className="mt-1 text-sm text-neutral-600">
                      {selectedEvent.instructorBio}
                    </p>
                  )}
                </div>

                {selectedEvent.description && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-neutral-900">
                      About this event
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 p-3">
                  <span className="font-semibold">Price</span>
                  <span className="text-lg font-bold">
                    {formatPrice(selectedEvent.price)}
                  </span>
                </div>

                {canManageSelectedEvent && (
                  <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600">
                    Certificates:{" "}
                    <span className="font-semibold text-neutral-900">
                      {selectedEventHasCertificates ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                )}

                {selectedEvent.registeredBarbers?.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-neutral-900">
                      Approved participants (
                      {selectedEvent.registeredBarbers.length})
                    </h3>
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                      {selectedEvent.registeredBarbers.map((barber) => (
                        <div
                          key={barber._id}
                          className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                        >
                          {barber.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentUser && selectedEvent.status === "upcoming" && (
                  <div className="mt-6">
                    {/* Organizer cannot register */}
                    {String(selectedEvent?.organizerId?._id || selectedEvent?.organizerId) ===
                      String(currentUserId) ? (
                      <Button className="w-full" disabled variant="outline">
                        You are the organizer
                      </Button>
                    ) : (
                      <>
                        {selectedEventRegistrationStatus && (
                          <div
                            className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${getRegistrationStatusClasses(
                              selectedEventRegistrationStatus
                            )}`}
                          >
                            {getRegistrationStatusLabel(selectedEventRegistrationStatus)}
                        {selectedEventRegistrationStatus === "approved" && (
                              <span className="ml-1">You can participate.</span>
                            )}
                            {selectedEventRegistrationStatus === "waitlisted" && (
                              <span className="ml-1">You are on the waiting list.</span>
                            )}
                            {selectedEventRegistrationStatus === "rejected" &&
                              selectedEventRejectionReason && (
                                <span className="ml-1">
                                  Reason: {selectedEventRegistration?.rejectionReason}
                                </span>
                              )}
                          </div>
                        )}
                        {selectedEventRegistrationStatus === "pending" ||
                        selectedEventRegistrationStatus === "waitlisted" ? (
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={() => handleUnregister(selectedEvent._id)}
                          >
                            {selectedEventRegistrationStatus === "pending"
                              ? "Cancel Request"
                              : "Leave Waiting List"}
                          </Button>
                        ) : selectedEventRegistrationStatus === "rejected" ? (
                          <Button className="w-full" disabled>
                            Request Closed
                          </Button>
                        ) : selectedEventRegistrationStatus === "approved" ? (
                          <Button className="w-full" disabled variant="outline">
                            Approved
                          </Button>
                        ) : selectedEvent.registrationCount >=
                          selectedEvent.maxParticipants ? (
                          <Button className="w-full" disabled>
                            Event is Full
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            disabled={registeringEventId === selectedEvent._id}
                            onClick={() => handleRegister(selectedEvent._id)}
                          >
                            {registeringEventId === selectedEvent._id
                              ? "Registering..."
                              : "Register Now"}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="font-semibold text-neutral-900">Event Reviews</h3>
                  {selectedEvent?.reviews?.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {selectedEvent.reviews.map((review) => (
                        <div
                          key={review?._id || review?.id}
                          className="rounded-xl border border-neutral-200 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">
                                {review?.userName || "User"}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {"★".repeat(Math.max(1, Math.min(5, Number(review?.rating || 0))))}
                                {" "}
                                {review?.isVerified ? "Verified event" : ""}
                              </p>
                            </div>
                            {review?.createdAt && (
                              <span className="text-xs text-neutral-400">
                                {new Date(review.createdAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-neutral-700">
                            {review?.comment || "No comment provided."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500">No event reviews yet</p>
                  )}
                </div>

                {canManageSelectedEvent && (
                  <EventRegistrationManager
                    event={selectedEvent}
                    registrations={eventRegistrations}
                    groupedRegistrations={groupedEventRegistrations}
                    isLoading={isRegistrationsLoading}
                    message={registrationMessage}
                    isSubmitting={isUpdatingRegistration}
                    pendingCount={pendingRegistrationRequests.length}
                    selectedEventHasCertificates={selectedEventHasCertificates}
                    selectedEventEnded={selectedEventEnded}
                    onApprove={handleApproveRegistration}
                    onReject={openRejectRegistrationModal}
                    onMoveToWaitlist={handleWaitlistRegistration}
                    onCheckIn={handleCheckInRegistration}
                    onIssueCertificate={openCertificateModal}
                    onRevokeCertificate={(certificate) => {
                      setRevokingCertificate(certificate);
                      setRevokedReason("");
                    }}
                  />
                )}

                {/* Manage Attendance - for organizers/salon owners */}
                {canManageSelectedEvent &&
                  (selectedEvent.status === "upcoming" ||
                    selectedEvent.status === "completed") && (
                    <div className="mt-4 space-y-2">
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          setShowAttendanceModal(true);
                          fetchAttendanceRegistrations(selectedEvent._id);
                        }}
                      >
                        Manage Attendance
                      </Button>
                      {selectedEvent.certificatesIssued && (
                        <p className="text-center text-xs text-green-600 font-medium">
                          ✓ Certificates issued
                        </p>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      )}

      {showRejectModal && registrationToReject && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={closeRejectRegistrationModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Reject Registration</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Share an optional reason with {registrationToReject?.userName || "this user"}.
                </p>
              </div>
              <button
                className="rounded-full p-1 hover:bg-neutral-100"
                onClick={closeRejectRegistrationModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              className="mt-4 min-h-28 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="Reason for rejection"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
            />

            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1"
                disabled={isUpdatingRegistration}
                onClick={handleRejectRegistration}
              >
                {isUpdatingRegistration ? "Rejecting..." : "Confirm Reject"}
              </Button>
              <Button
                className="flex-1"
                onClick={closeRejectRegistrationModal}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Attendance Management Modal */}
      {showAttendanceModal && selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAttendanceModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold">
                Attendance - {selectedEvent.title}
              </h2>
              <button
                className="rounded-full p-1 hover:bg-neutral-100"
                onClick={() => setShowAttendanceModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {attendanceMessage && (
              <p
                className={`mt-3 rounded-xl border p-3 text-sm ${
                  attendanceMessage.includes("Could not")
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700"
                }`}
              >
                {attendanceMessage}
              </p>
            )}

            {certificatesMessage && (
              <p
                className={`mt-3 rounded-xl border p-3 text-sm ${
                  certificatesMessage.includes("Could not") ||
                  certificatesMessage.includes("No barbers")
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700"
                }`}
              >
                {certificatesMessage}
              </p>
            )}

            {isAttendanceLoading ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-neutral-200"
                  />
                ))}
              </div>
            ) : attendanceRegistrations.length === 0 ? (
              <p className="mt-4 text-center text-sm text-neutral-500">
                No approved participants
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {attendanceRegistrations.map((reg) => (
                  <div
                    key={reg._id}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-600">
                        {reg.barberName?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {reg.barberName}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {reg.barberPhone || reg.barberEmail || ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Status badge */}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          reg.attendanceStatus === "attended"
                            ? "bg-green-100 text-green-700"
                            : reg.attendanceStatus === "no_show"
                              ? "bg-red-100 text-red-700"
                              : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {reg.attendanceStatus === "attended"
                          ? "Attended"
                          : reg.attendanceStatus === "no_show"
                            ? "No Show"
                            : "Pending"}
                      </span>
                      {/* Action buttons */}
                      <button
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          reg.attendanceStatus === "attended"
                            ? "bg-green-100 text-green-700"
                            : "bg-neutral-100 text-neutral-600 hover:bg-green-100 hover:text-green-700"
                        }`}
                        onClick={() =>
                          handleAttendanceChange(reg.barberId, "attended")
                        }
                      >
                        ✓ Attended
                      </button>
                      <button
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          reg.attendanceStatus === "no_show"
                            ? "bg-red-100 text-red-700"
                            : "bg-neutral-100 text-neutral-600 hover:bg-red-100 hover:text-red-700"
                        }`}
                        onClick={() =>
                          handleAttendanceChange(reg.barberId, "no_show")
                        }
                      >
                        ✗ No Show
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    className="w-full"
                    disabled={isSavingAttendance}
                    onClick={handleSaveAttendance}
                  >
                    {isSavingAttendance
                      ? "Saving..."
                      : "Save Attendance"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
