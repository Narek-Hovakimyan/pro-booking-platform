import { useCallback, useEffect, useRef, useState } from "react";
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
import useBarberSettingsData from "@/barber/components/settings/hooks/useBarberSettingsData";

import ConfirmModal from "@/shared/components/common/ConfirmModal";

import { updateCurrentUser } from "@/store/slices/authSlice";

export default function BarberSettings({
  isLoading = false,
  error = "",
  settingsView = "hub",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);

  // Salon state
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

  const updateCurrentUserSalonStatus = useCallback(
    (nextSalonStatus) => {
      dispatch(updateCurrentUser(nextSalonStatus));
    },
    [dispatch]
  );

  const {
    allSalonEntries,
    availableSalons,
    clearSalonReadError,
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
  } = useBarberSettingsData({
    currentUser,
    onCurrentUserSalonStatusChange: updateCurrentUserSalonStatus,
  });

  const clearSalonError = () => {
    setSalonError("");
    clearSalonReadError();
  };

  const updateSalonDraft = (field, value) => {
    clearSalonError();
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
    clearSalonError();
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
    clearSalonError();
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
    clearSalonError();
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
    clearSalonError();
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
    clearSalonError();
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

  const salonEntriesWithRelationshipActions = allSalonEntries.map((entry) => {
    const salonId = entry?.salon?.id || entry?.salon?._id || entry?.id || entry?._id;

    return {
      ...entry,
      isRelationshipSaving: String(respondingRelationshipSalonId) === String(salonId),
      onRelationshipResponse: (response) =>
        respondToRelationshipRequest(salonId, response),
    };
  });

  const effectivePromotionSalonId =
    selectedPromotionSalonId || managedSalons[0]?.id || managedSalons[0]?._id || "";
  const selectedPromotionSalon =
    managedSalons.find(
      (salon) =>
        String(salon.id || salon._id || "") ===
        String(effectivePromotionSalonId || "")
    ) || managedSalons[0];
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

  const saveRelationshipType = async (
    salonId,
    barberId,
    relationshipType
  ) => {
    if (isSalonSaving) return;

    const nextSavingKey = `${salonId}:${barberId}`;
    setIsSalonSaving(true);
    setSavingRelationshipKey(nextSavingKey);
    clearSalonError();
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
    clearSalonError();
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
    clearSalonError();
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
            salonError={salonError || salonReadError}
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
