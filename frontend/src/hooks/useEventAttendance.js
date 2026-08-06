import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";

export function useEventAttendance({ selectedEvent }) {
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceRegistrations, setAttendanceRegistrations] = useState([]);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [certificatesMessage, setCertificatesMessage] = useState("");
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const fetchAttendanceRegistrations = useCallback(async (eventId) => {
    const requestId = ++requestIdRef.current;
    setIsAttendanceLoading(true);
    setAttendanceMessage("");
    setCertificatesMessage("");

    try {
      const { data } = await api.get(`/events/${eventId}/registrations`);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setAttendanceRegistrations(
        (Array.isArray(data) ? data : []).filter(
          (registration) => registration?.status === "approved"
        )
      );
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setAttendanceMessage(
        err.response?.data?.message || "Could not load registrations"
      );
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsAttendanceLoading(false);
      }
    }
  }, []);

  const openAttendanceModal = useCallback(() => {
    if (!selectedEvent?._id) return;
    setShowAttendanceModal(true);
    void fetchAttendanceRegistrations(selectedEvent._id);
  }, [fetchAttendanceRegistrations, selectedEvent]);

  const closeAttendanceModal = useCallback(() => {
    setShowAttendanceModal(false);
  }, []);

  const handleAttendanceChange = useCallback((barberId, status) => {
    setAttendanceRegistrations((prev) =>
      prev.map((registration) =>
        registration.barberId === barberId
          ? { ...registration, attendanceStatus: status }
          : registration
      )
    );
  }, []);

  const handleSaveAttendance = useCallback(async () => {
    if (!selectedEvent?._id) return;
    setIsSavingAttendance(true);
    setAttendanceMessage("");

    try {
      const payload = attendanceRegistrations.map((registration) => ({
        barberId: registration.barberId,
        attendanceStatus: registration.attendanceStatus,
      }));
      const { data } = await api.put(`/events/${selectedEvent._id}/attendance`, {
        registrations: payload,
      });
      setAttendanceMessage(data.message || "Attendance saved");
    } catch (err) {
      setAttendanceMessage(
        err.response?.data?.message || "Could not save attendance"
      );
    } finally {
      if (mountedRef.current) setIsSavingAttendance(false);
    }
  }, [attendanceRegistrations, selectedEvent]);

  return {
    attendanceMessage,
    attendanceRegistrations,
    certificatesMessage,
    closeAttendanceModal,
    fetchAttendanceRegistrations,
    handleAttendanceChange,
    handleSaveAttendance,
    isAttendanceLoading,
    isSavingAttendance,
    openAttendanceModal,
    setAttendanceMessage,
    setAttendanceRegistrations,
    setCertificatesMessage,
    setShowAttendanceModal,
    showAttendanceModal,
  };
}

