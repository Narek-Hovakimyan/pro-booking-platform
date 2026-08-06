import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";

export function useEventCertificates({
  fetchEventRegistrations,
  selectedEvent,
  setIsUpdatingRegistration,
  setRegistrationMessage,
}) {
  const [certificateModal, setCertificateModal] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [revokingCertificate, setRevokingCertificate] = useState(null);
  const [revokedReason, setRevokedReason] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const openCertificateModal = useCallback((eventId, registrationId) => {
    setCertificateFile(null);
    setCertificateModal({ eventId, registrationId, mode: "auto" });
  }, []);

  const openRevokeCertificateModal = useCallback((certificate) => {
    setRevokingCertificate(certificate);
    setRevokedReason("");
  }, []);

  const closeCertificateModal = useCallback(() => {
    setCertificateModal(null);
    setCertificateFile(null);
  }, []);

  const handleIssueCertificateUpload = useCallback(async () => {
    if (!certificateModal || setIsUpdatingRegistration == null) return;

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
        setRegistrationMessage(
          data.message || "Certificate issued with uploaded file"
        );
      }
      closeCertificateModal();
    } catch (err) {
      setRegistrationMessage(
        err.response?.data?.message || "Could not issue certificate"
      );
    } finally {
      if (mountedRef.current) setIsUpdatingRegistration(false);
    }
  }, [
    certificateFile,
    certificateModal,
    closeCertificateModal,
    fetchEventRegistrations,
    setIsUpdatingRegistration,
    setRegistrationMessage,
  ]);

  const closeRevokeCertificateModal = useCallback(() => {
    setRevokingCertificate(null);
    setRevokedReason("");
  }, []);

  const handleRevokeCertificate = useCallback(async () => {
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
      if (mountedRef.current) setIsUpdatingRegistration(false);
    }
  }, [
    closeRevokeCertificateModal,
    fetchEventRegistrations,
    revokedReason,
    revokingCertificate,
    selectedEvent,
    setIsUpdatingRegistration,
    setRegistrationMessage,
  ]);

  return {
    certificateFile,
    certificateModal,
    closeCertificateModal,
    closeRevokeCertificateModal,
    handleIssueCertificateUpload,
    handleRevokeCertificate,
    openCertificateModal,
    openRevokeCertificateModal,
    revokedReason,
    revokingCertificate,
    setCertificateFile,
    setCertificateModal,
    setRevokedReason,
    setRevokingCertificate,
    setCertificateMode: (mode) => {
      if (mode === "auto") {
        setCertificateFile(null);
      }
      setCertificateModal((prev) => (prev ? { ...prev, mode } : null));
    },
  };
}
