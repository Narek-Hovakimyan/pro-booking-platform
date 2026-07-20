import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "@/shared/api/axios";

export default function useBarberSettingsData({
  currentUser,
  onCurrentUserSalonStatusChange,
}) {
  const currentUserId = currentUser?.id || currentUser?._id;
  const salonDataUserId = currentUser?.id;
  const eventCertificateUserId = currentUser?.id;
  const [eventCertificates, setEventCertificates] = useState([]);
  const [salons, setSalons] = useState([]);
  const [salonStatus, setSalonStatus] = useState({
    salonStatus: currentUser?.salonStatus || "none",
    salon: null,
    pendingRequest: null,
    ownedSalons: [],
    managedSalons: [],
  });
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [salonReadError, setSalonReadError] = useState("");
  const [salonAdmins, setSalonAdmins] = useState({});
  const [salonStaffById, setSalonStaffById] = useState({});

  const isMountedRef = useRef(false);
  const salonDataRequestTokenRef = useRef(0);
  const managedSalonRequestTokenRef = useRef(0);
  const certificatesRequestTokenRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      salonDataRequestTokenRef.current += 1;
      managedSalonRequestTokenRef.current += 1;
      certificatesRequestTokenRef.current += 1;
    };
  }, []);

  const managedSalons = useMemo(
    () => salonStatus.managedSalons || salonStatus.ownedSalons || [],
    [salonStatus.managedSalons, salonStatus.ownedSalons]
  );

  const refreshManagedSalonData = useCallback(
    async (nextManagedSalons = managedSalons, shouldContinue = () => true) => {
      const requestToken = managedSalonRequestTokenRef.current + 1;
      managedSalonRequestTokenRef.current = requestToken;
      const isActiveRequest = () =>
        isMountedRef.current &&
        managedSalonRequestTokenRef.current === requestToken &&
        shouldContinue();

      if (nextManagedSalons.length === 0) {
        if (!isActiveRequest()) return;
        setSalonAdmins({});
        setSalonStaffById({});
        return;
      }

      const adminMap = {};
      const staffMap = {};
      for (const salon of nextManagedSalons) {
        const salonId = salon.id || salon._id;
        try {
          const [adminsResponse, staffResponse] = await Promise.all([
            api.get(`/salons/${salonId}/admins`),
            api.get(`/salons/${salonId}/staff`),
          ]);
          if (isActiveRequest()) {
            adminMap[salonId] = adminsResponse.data;
            staffMap[salonId] = staffResponse.data || [];
          }
        } catch {
          // Silently fail
        }
      }
      if (isActiveRequest()) {
        setSalonAdmins(adminMap);
        setSalonStaffById(staffMap);
      }
    },
    [managedSalons]
  );

  useEffect(() => {
    if (!eventCertificateUserId) return undefined;

    const requestToken = certificatesRequestTokenRef.current + 1;
    certificatesRequestTokenRef.current = requestToken;
    const isActiveRequest = () =>
      isMountedRef.current &&
      certificatesRequestTokenRef.current === requestToken;

    async function fetchEventCertificates() {
      try {
        const { data } = await api.get(
          `/barbers/${eventCertificateUserId}/event-certificates`
        );

        if (isActiveRequest()) {
          setEventCertificates(data || []);
        }
      } catch {
        if (isActiveRequest()) {
          setEventCertificates([]);
        }
      }
    }

    fetchEventCertificates();

    return () => {
      certificatesRequestTokenRef.current += 1;
    };
  }, [eventCertificateUserId]);

  const refreshSalonData = async (shouldContinue = () => true) => {
    const requestToken = salonDataRequestTokenRef.current + 1;
    salonDataRequestTokenRef.current = requestToken;
    const isActiveRequest = () =>
      isMountedRef.current &&
      salonDataRequestTokenRef.current === requestToken &&
      shouldContinue();

    const [salonsResponse, statusResponse, requestsResponse] = await Promise.all([
      api.get("/salons"),
      api.get("/salons/me/status"),
      api.get("/salons/owner/requests"),
    ]);

    if (!isActiveRequest()) return;

    setSalons(salonsResponse.data || []);
    setSalonStatus(statusResponse.data || {});
    setOwnerRequests(requestsResponse.data || []);
    onCurrentUserSalonStatusChange({
      salon:
        statusResponse.data?.salon?._id ||
        statusResponse.data?.salon?.id ||
        null,
      salonStatus: statusResponse.data?.salonStatus || "none",
    });

    const nextManagedSalons =
      statusResponse.data?.managedSalons || statusResponse.data?.ownedSalons || [];
    await refreshManagedSalonData(nextManagedSalons, shouldContinue);
  };

  useEffect(() => {
    if (!salonDataUserId) return undefined;

    const requestToken = salonDataRequestTokenRef.current + 1;
    salonDataRequestTokenRef.current = requestToken;
    const isActiveRequest = () =>
      isMountedRef.current && salonDataRequestTokenRef.current === requestToken;

    async function fetchSalonData() {
      setSalonReadError("");

      try {
        const [salonsResponse, statusResponse, requestsResponse] =
          await Promise.all([
            api.get("/salons"),
            api.get("/salons/me/status"),
            api.get("/salons/owner/requests"),
          ]);

        if (!isActiveRequest()) return;

        setSalons(salonsResponse.data || []);
        setSalonStatus(statusResponse.data || {});
        setOwnerRequests(requestsResponse.data || []);
        onCurrentUserSalonStatusChange({
          salon:
            statusResponse.data?.salon?._id ||
            statusResponse.data?.salon?.id ||
            null,
          salonStatus: statusResponse.data?.salonStatus || "none",
        });
      } catch (requestError) {
        if (isActiveRequest()) {
          setSalonReadError(
            requestError.response?.data?.message ||
              "Could not load salon settings. Please try again."
          );
        }
      }
    }

    fetchSalonData();

    return () => {
      salonDataRequestTokenRef.current += 1;
    };
  }, [salonDataUserId, onCurrentUserSalonStatusChange]);

  useEffect(() => {
    const requestToken = managedSalonRequestTokenRef.current + 1;
    managedSalonRequestTokenRef.current = requestToken;
    const isActiveRequest = () =>
      isMountedRef.current && managedSalonRequestTokenRef.current === requestToken;

    if (managedSalons.length === 0) {
      if (isActiveRequest()) {
        setSalonAdmins({});
        setSalonStaffById({});
      }
      return undefined;
    }

    refreshManagedSalonData();
    return undefined;
  }, [managedSalons.length, refreshManagedSalonData]);

  const salonEntries = (salonStatus.salons || []).map((entry) => {
    const salonId = entry?.id || entry?._id;
    const fullSalon = salons.find(
      (salon) => String(salon.id || salon._id) === String(salonId)
    );
    return {
      ...entry,
      salon: fullSalon || entry,
    };
  });

  const pendingEntries = (salonStatus.pendingEntries || []).map((entry) => {
    const salonId = entry?.id || entry?._id;
    const fullSalon = salons.find(
      (salon) => String(salon.id || salon._id) === String(salonId)
    );
    return {
      ...entry,
      salon: fullSalon || entry,
    };
  });

  const legacySalonEntry =
    salonStatus.salonStatus === "approved" && salonStatus.salon
      ? {
          salon: salonStatus.salon,
          status: "approved",
          isPrimary: true,
        }
      : null;

  const allSalonEntries =
    salonEntries.length > 0 ? salonEntries : legacySalonEntry ? [legacySalonEntry] : [];

  const barberConnectedSalonIds = new Set([
    ...(currentUser?.salons || []).map((s) => s.salon?._id?.toString()),
    ...(currentUser?.salons || []).map((s) => s.salon?.toString()),
    ...allSalonEntries.map((e) => e.salon?.id || e.salon?._id?.toString()),
    ...pendingEntries.map((e) => e.salon?.id || e.salon?._id?.toString()),
    ...(salonStatus.ownedSalons || []).map((s) => s.id || s._id?.toString()),
  ].filter(Boolean));

  const availableSalons = (salons || []).filter((salon) => {
    const salonId = salon.id || salon._id;
    return !barberConnectedSalonIds.has(String(salonId));
  });

  return {
    allSalonEntries,
    availableSalons,
    clearSalonReadError: () => setSalonReadError(""),
    currentUserId,
    eventCertificates,
    managedSalons,
    ownerRequests,
    pendingEntries,
    refreshSalonData,
    salonAdmins,
    salonReadError,
    salonStaffById,
    salonStatus,
    salons,
  };
}
