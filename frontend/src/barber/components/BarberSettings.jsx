import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import DepositSettingsSection from "@/barber/components/DepositSettingsSection";
import useDefaultSalonScheduleSettings from "@/barber/hooks/useDefaultSalonScheduleSettings";

import DefaultScheduleSection from "@/barber/components/settings/DefaultScheduleSection";
import BarberSettingsLayout from "@/barber/components/settings/BarberSettingsLayout";
import SettingsHub from "@/barber/components/settings/SettingsHub";
import SalonSettingsView from "@/barber/components/settings/salon/SalonSettingsView";
import PromotionSettingsView from "@/barber/components/settings/promotions/PromotionSettingsView";
import CertificationSettingsView from "@/barber/components/settings/certifications/CertificationSettingsView";

import ConfirmModal from "@/shared/components/common/ConfirmModal";

import { updateCurrentUser } from "@/store/slices/authSlice";

export default function BarberSettings({
  isLoading = false,
  error = "",
  settingsView = "hub",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const [eventCertificates, setEventCertificates] = useState([]);

  // Salon state
  const [salons, setSalons] = useState([]);
  const [salonStatus, setSalonStatus] = useState({
    salonStatus: currentUser?.salonStatus || "none",
    salon: null,
    pendingRequest: null,
    ownedSalons: [],
    managedSalons: [],
  });
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [salonDraft, setSalonDraft] = useState({
    name: "",
    city: "",
    address: "",
    phone: "",
    imageUrl: "",
    ownerWorksAsSpecialist: true,
  });
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [selectedPromotionSalonId, setSelectedPromotionSalonId] = useState("");
  const [salonError, setSalonError] = useState("");
  const [salonSaved, setSalonSaved] = useState("");
  const [isSalonSaving, setIsSalonSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [salonStaffById, setSalonStaffById] = useState({});
  const [savingRelationshipKey, setSavingRelationshipKey] = useState("");
  const [savingPaymentKey, setSavingPaymentKey] = useState("");
  const [respondingRelationshipSalonId, setRespondingRelationshipSalonId] =
    useState("");

  const isMountedRef = useRef(true);
  const cancelSalonRequestTokenRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cancelSalonRequestTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    let isMounted = true;

    async function fetchEventCertificates() {
      try {
        const { data } = await api.get(
          `/barbers/${currentUser.id}/event-certificates`
        );

        if (isMounted) {
          setEventCertificates(data || []);
        }
      } catch {
        if (isMounted) {
          setEventCertificates([]);
        }
      }
    }

    fetchEventCertificates();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);


  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function fetchSalonData() {
      setSalonError("");

      try {
        const [salonsResponse, statusResponse, requestsResponse] =
          await Promise.all([
            api.get("/salons"),
            api.get("/salons/me/status"),
            api.get("/salons/owner/requests"),
          ]);

        if (!isMounted) return;

        setSalons(salonsResponse.data || []);
        setSalonStatus(statusResponse.data || {});
        setOwnerRequests(requestsResponse.data || []);
        dispatch(
          updateCurrentUser({
            salon:
              statusResponse.data?.salon?._id ||
              statusResponse.data?.salon?.id ||
              null,
            salonStatus: statusResponse.data?.salonStatus || "none",
          })
        );
      } catch (requestError) {
        if (isMounted) {
          setSalonError(
            requestError.response?.data?.message ||
              "Could not load salon settings. Please try again."
          );
        }
      }
    }

    fetchSalonData();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, dispatch]);

  const refreshSalonData = async (shouldContinue = () => true) => {
    const [salonsResponse, statusResponse, requestsResponse] = await Promise.all([
      api.get("/salons"),
      api.get("/salons/me/status"),
      api.get("/salons/owner/requests"),
    ]);

    if (!shouldContinue()) return;

    setSalons(salonsResponse.data || []);
    setSalonStatus(statusResponse.data || {});
    setOwnerRequests(requestsResponse.data || []);
    dispatch(
      updateCurrentUser({
        salon:
          statusResponse.data?.salon?._id ||
          statusResponse.data?.salon?.id ||
          null,
        salonStatus: statusResponse.data?.salonStatus || "none",
      })
    );

    // Re-fetch admin data for managed salons
    const managed = statusResponse.data?.managedSalons || statusResponse.data?.ownedSalons || [];
    if (managed.length > 0) {
      const adminMap = {};
      const staffMap = {};
      for (const salon of managed) {
        const salonId = salon.id || salon._id;
        try {
          const [adminsResponse, staffResponse] = await Promise.all([
            api.get(`/salons/${salonId}/admins`),
            api.get(`/salons/${salonId}/staff`),
          ]);
          adminMap[salonId] = adminsResponse.data;
          staffMap[salonId] = staffResponse.data || [];
        } catch {
          // Silently fail
        }
      }
      if (!shouldContinue()) return;
      setSalonAdmins(adminMap);
      setSalonStaffById(staffMap);
    } else {
      if (!shouldContinue()) return;
      setSalonAdmins({});
      setSalonStaffById({});
    }
  };

  const updateSalonDraft = (field, value) => {
    setSalonError("");
    setSalonSaved("");
    setSalonDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const createSalon = async (event) => {
    event.preventDefault();

    if (!salonDraft.name.trim() || isSalonSaving) return;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.post("/salons", salonDraft);
      setSalonDraft({
        name: "",
        city: "",
        address: "",
        phone: "",
        imageUrl: "",
        ownerWorksAsSpecialist: true,
      });
      await refreshSalonData();
      setSalonSaved("Salon created.");
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not create salon. Please try again."
      );
    } finally {
      setIsSalonSaving(false);
    }
  };

  const requestSalonJoin = async () => {
    if (!selectedSalonId || isSalonSaving) return;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.post(`/salons/${selectedSalonId}/join-requests`);
      await refreshSalonData();
      setSalonSaved("Salon request pending.");
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not send salon request. Please try again."
      );
    } finally {
      setIsSalonSaving(false);
    }
  };

  const cancelSalonRequest = async (salonId) => {
    if (!salonId || isSalonSaving) return;

    const requestToken = cancelSalonRequestTokenRef.current + 1;
    cancelSalonRequestTokenRef.current = requestToken;
    const isActiveCancelRequest = () =>
      isMountedRef.current && cancelSalonRequestTokenRef.current === requestToken;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.put(`/salons/join-requests/by-salon/${salonId}/cancel`);
      if (!isActiveCancelRequest()) return;
      await refreshSalonData(isActiveCancelRequest);
      if (!isActiveCancelRequest()) return;
      setSalonSaved("Salon request cancelled.");
    } catch (requestError) {
      if (!isActiveCancelRequest()) return;
      setSalonError(
        requestError.response?.data?.message ||
          "Could not cancel salon request. Please try again."
      );
    } finally {
      if (isActiveCancelRequest()) {
        setIsSalonSaving(false);
      }
    }
  };

  const decideSalonRequest = async (requestId, status) => {
    if (isSalonSaving) return;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.put(`/salons/join-requests/${requestId}`, { status });
      await refreshSalonData();
      setSalonSaved(
        status === "accepted" ? "Salon request accepted." : "Salon request rejected."
      );
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not update salon request. Please try again."
      );
    } finally {
      setIsSalonSaving(false);
    }
  };

  const openRemoveBarberConfirmation = (salon, barber) => {
    setConfirmation({
      type: "remove",
      title: "Remove specialist",
      message: "Remove this specialist from salon?",
      confirmLabel: "Remove specialist",
      salonId: salon?.id || salon?._id,
      barberId: barber?.id || barber?._id,
      barberName: barber?.name || "Specialist",
      salonName: salon?.name || "salon",
    });
  };

  const openLeaveSalonConfirmation = (salonName, salonId) => {
    setConfirmation({
      type: "leave",
      title: `Leave ${salonName}`,
      message: `Are you sure you want to leave ${salonName}?`,
      confirmLabel: "Leave salon",
      salonId,
    });
  };

  const openPromoteAdminConfirmation = (salonName, salonId, barber) => {
    const barberId = barber?.id || barber?._id;

    setConfirmation({
      type: "promote",
      title: `Promote ${barber.name}`,
      message: `Promote ${barber.name} to admin of ${salonName}?`,
      confirmLabel: "Promote to admin",
      salonId,
      barberId,
      barberName: barber.name,
      salonName,
    });
  };

  const openDemoteAdminConfirmation = (salonName, salonId, admin) => {
    const adminId = admin?.id || admin?._id;

    setConfirmation({
      type: "demote",
      title: `Remove admin: ${admin.name}`,
      message: `Remove ${admin.name} as admin of ${salonName}?`,
      confirmLabel: "Remove admin",
      salonId,
      barberId: adminId,
      barberName: admin.name,
      salonName,
    });
  };

  const closeConfirmation = () => {
    if (isSalonSaving) return;
    setConfirmation(null);
  };

  const confirmSalonAction = async () => {
    if (!confirmation || isSalonSaving) return;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      if (confirmation.type === "leave") {
        const { data } = await api.patch("/salons/leave", {
          salonId: confirmation.salonId,
        });

        if (data?.user) {
          dispatch(
            updateCurrentUser({
              salon: data.user.salon || null,
              salonStatus: data.user.salonStatus || "none",
              workHistory: data.user.workHistory || [],
            })
          );
        }

        await refreshSalonData();
        setSalonSaved("Left salon.");
      }

      if (confirmation.type === "remove") {
        await api.patch(
          `/salons/${confirmation.salonId}/remove-barber/${confirmation.barberId}`
        );
        await refreshSalonData();
        setSalonSaved(`${confirmation.barberName} removed from ${confirmation.salonName}.`);
      }

      if (confirmation.type === "promote") {
        await api.patch(
          `/salons/${confirmation.salonId}/promote-admin/${confirmation.barberId}`
        );
        await refreshSalonData();
        setSalonSaved(`${confirmation.barberName} promoted to admin.`);
      }

      if (confirmation.type === "demote") {
        await api.patch(
          `/salons/${confirmation.salonId}/demote-admin/${confirmation.barberId}`
        );
        await refreshSalonData();
        setSalonSaved(`${confirmation.barberName} removed as admin.`);
      }

      setConfirmation(null);
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not update salon staff. Please try again."
      );
    } finally {
      setIsSalonSaving(false);
    }
  };

  // Build list of all approved salon entries from the new salons array
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

  // Build list of pending salon entries
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

  // Fallback to legacy single salon
  const legacySalonEntry =
    salonStatus.salonStatus === "approved" && salonStatus.salon
      ? {
          salon: salonStatus.salon,
          status: "approved",
          isPrimary: true,
        }
      : null;

  // Use new salons array if available, otherwise fallback to legacy
  const allSalonEntries =
    salonEntries.length > 0 ? salonEntries : legacySalonEntry ? [legacySalonEntry] : [];
  const salonEntriesWithRelationshipActions = allSalonEntries.map((entry) => {
    const salonId = entry?.salon?.id || entry?.salon?._id || entry?.id || entry?._id;

    return {
      ...entry,
      isRelationshipSaving: String(respondingRelationshipSalonId) === String(salonId),
      onRelationshipResponse: (response) =>
        respondToRelationshipRequest(salonId, response),
    };
  });

  const managedSalons = useMemo(
    () => salonStatus.managedSalons || salonStatus.ownedSalons || [],
    [salonStatus.managedSalons, salonStatus.ownedSalons]
  );
  const effectivePromotionSalonId =
    selectedPromotionSalonId || managedSalons[0]?.id || managedSalons[0]?._id || "";
  const selectedPromotionSalon =
    managedSalons.find(
      (salon) =>
        String(salon.id || salon._id || "") ===
        String(effectivePromotionSalonId || "")
    ) || managedSalons[0];
  const currentUserId = currentUser?.id || currentUser?._id;
  const [salonAdmins, setSalonAdmins] = useState({});
  const {
    salonSchedules,
    savingSalonId,
    savedSalonId,
    errorSalonId,
    salonScheduleErrors,
    updateSalonSchedule,
    updateWeeklyDaySchedule,
    saveDefaultSchedule,
  } = useDefaultSalonScheduleSettings({
    currentUserId,
    salonStatusSalons: salonStatus.salons,
  });

  // Fetch admin info for each managed salon
  useEffect(() => {
    if (managedSalons.length === 0) return;

    let isMounted = true;

    async function fetchManagedSalonData() {
      const adminMap = {};
      const staffMap = {};
      for (const salon of managedSalons) {
        const salonId = salon.id || salon._id;
        try {
          const [adminsResponse, staffResponse] = await Promise.all([
            api.get(`/salons/${salonId}/admins`),
            api.get(`/salons/${salonId}/staff`),
          ]);
          if (isMounted) {
            adminMap[salonId] = adminsResponse.data;
            staffMap[salonId] = staffResponse.data || [];
          }
        } catch {
          // Silently fail
        }
      }
      if (isMounted) {
        setSalonAdmins(adminMap);
        setSalonStaffById(staffMap);
      }
    }

    fetchManagedSalonData();

    return () => {
      isMounted = false;
    };
  }, [managedSalons]);

  const saveRelationshipType = async (
    salonId,
    barberId,
    relationshipType
  ) => {
    if (isSalonSaving) return;

    const nextSavingKey = `${salonId}:${barberId}`;
    setIsSalonSaving(true);
    setSavingRelationshipKey(nextSavingKey);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.patch(
        `/salons/${salonId}/members/${barberId}/relationship-type`,
        { relationshipType }
      );
      await refreshSalonData();
      setSalonSaved("Relationship request sent. Waiting for specialist confirmation.");
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not update relationship type. Please try again."
      );
    } finally {
      setSavingRelationshipKey("");
      setIsSalonSaving(false);
    }
  };

  const saveStaffPayment = async (salonId, barberId, staffPayment) => {
    if (isSalonSaving) return false;

    const nextSavingKey = `${salonId}:${barberId}`;
    setIsSalonSaving(true);
    setSavingPaymentKey(nextSavingKey);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.patch(`/salons/${salonId}/staff/${barberId}/payment-settings`, {
        staffPayment,
      });
      await refreshSalonData();
      setSalonSaved("Staff payment settings updated.");
      return true;
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not update staff payment settings. Please try again."
      );
      return false;
    } finally {
      setSavingPaymentKey("");
      setIsSalonSaving(false);
    }
  };

  const respondToRelationshipRequest = async (salonId, response) => {
    if (!salonId || isSalonSaving) return;

    setIsSalonSaving(true);
    setRespondingRelationshipSalonId(salonId);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.patch(`/salons/${salonId}/relationship-type/respond`, {
        response,
      });
      await refreshSalonData();
      setSalonSaved(
        response === "accepted"
          ? "Relationship request accepted."
          : "Relationship request rejected."
      );
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not respond to relationship request. Please try again."
      );
    } finally {
      setRespondingRelationshipSalonId("");
      setIsSalonSaving(false);
    }
  };

  // Filter out salons the barber is already connected to (frontend safety backup)
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

  return (
    <BarberSettingsLayout
      confirmation={
        confirmation && (
          <ConfirmModal
            confirmLabel={confirmation.confirmLabel}
            disabled={isSalonSaving}
            message={confirmation.message}
            onCancel={closeConfirmation}
            onConfirm={confirmSalonAction}
            title={confirmation.title}
          />
        )
      }
    >
        {settingsView === "hub" && <SettingsHub error={error} />}

        {settingsView === "salon" && (
          <SalonSettingsView
            allSalonEntries={allSalonEntries}
            availableSalons={availableSalons}
            currentUserId={currentUserId}
            error={error}
            isLoading={isLoading}
            isSalonSaving={isSalonSaving}
            managedSalons={managedSalons}
            ownerRequests={ownerRequests}
            pendingEntries={pendingEntries}
            salonAdmins={salonAdmins}
            salonDraft={salonDraft}
            salonEntriesWithRelationshipActions={salonEntriesWithRelationshipActions}
            salonError={salonError}
            salonSaved={salonSaved}
            salonStaffById={salonStaffById}
            salonStatus={salonStatus}
            salons={salons}
            savingPaymentKey={savingPaymentKey}
            savingRelationshipKey={savingRelationshipKey}
            selectedSalonId={selectedSalonId}
            onCancelSalonRequest={cancelSalonRequest}
            onCreateSalon={createSalon}
            onDecideSalonRequest={decideSalonRequest}
            onOpenDemoteConfirmation={openDemoteAdminConfirmation}
            onOpenLeaveConfirmation={openLeaveSalonConfirmation}
            onOpenPromoteConfirmation={openPromoteAdminConfirmation}
            onOpenRemoveBarberConfirmation={openRemoveBarberConfirmation}
            onRequestSalonJoin={requestSalonJoin}
            onSaveRelationshipType={saveRelationshipType}
            onSaveStaffPayment={saveStaffPayment}
            onSelectedSalonChange={setSelectedSalonId}
            onUpdateSalonDraft={updateSalonDraft}
          />
        )}

        {settingsView === "default-schedule" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Default Schedule</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading ? (
              <p className="text-neutral-500">Loading...</p>
            ) : (
              <DefaultScheduleSection
                allSalonEntries={allSalonEntries}
                salonSchedules={salonSchedules}
                savingSalonId={savingSalonId}
                savedSalonId={savedSalonId}
                errorSalonId={errorSalonId}
                salonScheduleErrors={salonScheduleErrors}
                onUpdateSchedule={updateSalonSchedule}
                onUpdateWeeklyDay={updateWeeklyDaySchedule}
                onSaveSchedule={saveDefaultSchedule}
              />
            )}
          </>
        )}

        {settingsView === "promotions" && (
          <PromotionSettingsView
            effectivePromotionSalonId={effectivePromotionSalonId}
            error={error}
            isLoading={isLoading}
            managedSalons={managedSalons}
            selectedPromotionSalon={selectedPromotionSalon}
            onSelectedPromotionSalonChange={setSelectedPromotionSalonId}
          />
        )}

        {settingsView === "deposit" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Booking Deposit / No-show Protection</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading ? (
              <p className="text-neutral-500">Loading...</p>
            ) : (
              <DepositSettingsSection />
            )}
          </>
        )}

        {settingsView === "certifications" && (
          <CertificationSettingsView
            error={error}
            eventCertificates={eventCertificates}
            isLoading={isLoading}
          />
        )}
    </BarberSettingsLayout>
  );
}
