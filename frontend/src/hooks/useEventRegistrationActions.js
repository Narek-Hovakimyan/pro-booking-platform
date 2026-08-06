import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { addNotification } from "@/store/slices/notificationsSlice";
import {
  getRegistrationReason,
  getRegistrationStatus,
  isEventEnded,
} from "@/features/events/utils/eventFormatters";

export function useEventRegistrationActions({
  canManageEvent,
  currentUser,
  myRegistrationsByEventId,
  refreshMyRegistrations,
  syncEventRegistrationCount,
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [eventRegistrations, setEventRegistrations] = useState([]);
  const [isRegistrationsLoading, setIsRegistrationsLoading] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [isUpdatingRegistration, setIsUpdatingRegistration] = useState(false);
  const [registeringEventId, setRegisteringEventId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [registrationToReject, setRegistrationToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const mountedRef = useRef(true);
  const detailRequestIdRef = useRef(0);
  const registrationsRequestIdRef = useRef(0);
  const registerLockRef = useRef(false);
  const mutationLockRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const fetchEventRegistrations = useCallback(async (eventId) => {
    const requestId = ++registrationsRequestIdRef.current;
    setIsRegistrationsLoading(true);
    setRegistrationMessage("");

    try {
      const { data } = await api.get(`/events/${eventId}/registrations`);
      if (!mountedRef.current || requestId !== registrationsRequestIdRef.current) {
        return false;
      }
      setEventRegistrations(Array.isArray(data) ? data : []);
      return true;
    } catch (err) {
      if (!mountedRef.current || requestId !== registrationsRequestIdRef.current) {
        return false;
      }
      setRegistrationMessage(
        err.response?.data?.message || "Could not load registration requests"
      );
      setEventRegistrations([]);
      return false;
    } finally {
      if (mountedRef.current && requestId === registrationsRequestIdRef.current) {
        setIsRegistrationsLoading(false);
      }
    }
  }, []);

  const openDetail = useCallback(
    async (event) => {
      const requestId = ++detailRequestIdRef.current;
      setIsDetailLoading(true);
      setRegistrationMessage("");
      setEventRegistrations([]);
      setSelectedEvent(event);

      try {
        const { data } = await api.get(`/events/${event._id}`);
        if (!mountedRef.current || requestId !== detailRequestIdRef.current) {
          return;
        }
        setSelectedEvent(data);
        if (canManageEvent(data)) {
          await fetchEventRegistrations(data._id);
        }
      } catch {
        // keep basic info
      } finally {
        if (mountedRef.current && requestId === detailRequestIdRef.current) {
          setIsDetailLoading(false);
        }
      }
    },
    [canManageEvent, fetchEventRegistrations]
  );

  const closeDetailModal = useCallback(() => {
    setSelectedEvent(null);
    setRegistrationMessage("");
    setEventRegistrations([]);
  }, []);

  const handleRegister = useCallback(
    async (eventId) => {
      if (!currentUser) {
        navigate("/login");
        return;
      }

      if (registeringEventId === eventId || registerLockRef.current) return;
      registerLockRef.current = true;

      setRegistrationMessage("");
      setRegisteringEventId(eventId);

      try {
        const { data } = await api.post(`/events/${eventId}/register`);
        if (!mountedRef.current) {
          return;
        }
        syncEventRegistrationCount(eventId, data.registrationCount);
        await refreshMyRegistrations();
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }

        const message =
          err.response?.data?.message ||
          err.message ||
          "Failed to register for event";

        if (selectedEvent?._id === eventId) {
          setRegistrationMessage(message);
        } else {
          dispatch(addNotification({ message, type: "error" }));
        }
      } finally {
        if (mountedRef.current) {
          setRegisteringEventId(null);
        }
        setTimeout(() => {
          registerLockRef.current = false;
        }, 0);
      }
    },
    [
      currentUser,
      dispatch,
      navigate,
      selectedEvent,
      registeringEventId,
      refreshMyRegistrations,
      syncEventRegistrationCount,
    ]
  );

  const handleUnregister = useCallback(
    async (eventId) => {
      try {
        const { data } = await api.delete(`/events/${eventId}/register`);
        syncEventRegistrationCount(eventId, data.registrationCount);
        await refreshMyRegistrations();
      } catch (err) {
        alert(err.response?.data?.message || "Could not cancel registration");
      }
    },
    [refreshMyRegistrations, syncEventRegistrationCount]
  );

  const handleApproveRegistration = useCallback(
    async (eventId, registrationId) => {
      if (isUpdatingRegistration || mutationLockRef.current) return;
      mutationLockRef.current = true;

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
        if (mountedRef.current) setIsUpdatingRegistration(false);
        setTimeout(() => {
          mutationLockRef.current = false;
        }, 0);
      }
    },
    [fetchEventRegistrations, isUpdatingRegistration, syncEventRegistrationCount]
  );

  const handleWaitlistRegistration = useCallback(
    async (eventId, registrationId) => {
      if (isUpdatingRegistration || mutationLockRef.current) return;
      mutationLockRef.current = true;

      setIsUpdatingRegistration(true);
      setRegistrationMessage("");

      try {
        const { data } = await api.patch(
          `/events/${eventId}/registrations/${registrationId}/waitlist`
        );
        syncEventRegistrationCount(eventId, data.registrationCount);
        await fetchEventRegistrations(eventId);
        setRegistrationMessage(
          data.message || "Registration moved to waiting list"
        );
      } catch (err) {
        setRegistrationMessage(
          err.response?.data?.message ||
            "Could not move registration to waitlist"
        );
      } finally {
        if (mountedRef.current) setIsUpdatingRegistration(false);
        setTimeout(() => {
          mutationLockRef.current = false;
        }, 0);
      }
    },
    [fetchEventRegistrations, isUpdatingRegistration, syncEventRegistrationCount]
  );

  const openRejectRegistrationModal = useCallback((registration) => {
    setRegistrationToReject(registration);
    setRejectionReason(registration?.rejectionReason || "");
    setShowRejectModal(true);
  }, []);

  const closeRejectRegistrationModal = useCallback(() => {
    setShowRejectModal(false);
    setRegistrationToReject(null);
    setRejectionReason("");
  }, []);

  const handleRejectRegistration = useCallback(async () => {
    if (!selectedEvent?._id || !registrationToReject?._id || isUpdatingRegistration) {
      return;
    }

    if (mutationLockRef.current) return;
    mutationLockRef.current = true;
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
      if (mountedRef.current) setIsUpdatingRegistration(false);
      setTimeout(() => {
        mutationLockRef.current = false;
      }, 0);
    }
  }, [
    closeRejectRegistrationModal,
    fetchEventRegistrations,
    isUpdatingRegistration,
    rejectionReason,
    registrationToReject,
    selectedEvent,
    syncEventRegistrationCount,
  ]);

  const handleCheckInRegistration = useCallback(
    async (eventId, registrationId) => {
      if (isUpdatingRegistration || mutationLockRef.current) return;
      mutationLockRef.current = true;

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
        if (mountedRef.current) setIsUpdatingRegistration(false);
        setTimeout(() => {
          mutationLockRef.current = false;
        }, 0);
      }
    },
    [fetchEventRegistrations, isUpdatingRegistration]
  );

  const selectedEventRegistration = useMemo(
    () =>
      selectedEvent
        ? myRegistrationsByEventId.get(String(selectedEvent._id)) || null
        : null,
    [myRegistrationsByEventId, selectedEvent]
  );
  const selectedEventRegistrationStatus = getRegistrationStatus(
    selectedEventRegistration
  );
  const selectedEventRejectionReason = getRegistrationReason(
    selectedEventRegistration
  );
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

  return {
    closeDetailModal,
    closeRejectRegistrationModal,
    eventRegistrations,
    fetchEventRegistrations,
    groupedEventRegistrations,
    handleApproveRegistration,
    handleCheckInRegistration,
    handleRegister,
    handleRejectRegistration,
    handleUnregister,
    handleWaitlistRegistration,
    isDetailLoading,
    isRegistrationsLoading,
    isUpdatingRegistration,
    openDetail,
    openRejectRegistrationModal,
    pendingRegistrationRequests,
    rejectionReason,
    registeringEventId,
    registrationMessage,
    registrationToReject,
    showRejectModal,
    selectedEvent,
    selectedEventEnded: isEventEnded(selectedEvent),
    selectedEventHasCertificates: Boolean(selectedEvent?.certificatesEnabled),
    selectedEventRegistration,
    selectedEventRegistrationStatus,
    selectedEventRejectionReason,
    setRejectionReason,
    setSelectedEvent,
    setIsUpdatingRegistration,
    setRegistrationMessage,
  };
}
