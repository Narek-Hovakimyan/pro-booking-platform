import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, Calendar, Store, Clock, Award } from "lucide-react";

import api from "@/shared/api/axios";
import CertificationsManager from "@/barber/components/CertificationsManager";
import TeamSettingsSection from "@/barber/components/TeamSettingsSection";
import SalonPromotionsManager from "@/barber/components/SalonPromotionsManager";
import DepositSettingsSection from "@/barber/components/DepositSettingsSection";
import useDefaultSalonScheduleSettings from "@/barber/hooks/useDefaultSalonScheduleSettings";
import EventCertificatesSection from "@/barber/components/settings/EventCertificatesSection";

import DefaultScheduleSection from "@/barber/components/settings/DefaultScheduleSection";
import SalonSettingsSection from "@/barber/components/settings/SalonSettingsSection";

import ConfirmModal from "@/shared/components/common/ConfirmModal";

import { Card, CardContent } from "@/shared/components/ui/card";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { updateBarberProfile } from "@/store/slices/usersSlice";

function SettingsHubCard({ title, description, to }) {
  const iconMap = {
    Profile: BriefcaseBusiness,
    Schedule: Calendar,
    "Salon Settings": Store,
    "Default Schedule": Clock,
    Certifications: Award,
  };
  const Icon = iconMap[title] || ArrowRight;

  return (
    <Link
      to={to}
      className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800">
        <Icon className="h-4 w-4 text-neutral-300" />
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs text-neutral-500">{description}</p>
    </Link>
  );
}

export default function BarberSettings({
  isLoading = false,
  error = "",
  settingsView = "hub",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const savedProfile = useSelector((state) =>
    state.users.find((user) => String(user.id) === String(currentUser?.id))
  );

  // Profile state — kept for future settings page reuse; not rendered in any current view
  const [profile, setProfile] = useState({
    name: currentUser?.name || "",
    city: savedProfile?.city || currentUser?.city || "",
    phone: currentUser?.phone || "",
    imageUrl: savedProfile?.imageUrl || currentUser?.avatarUrl || "",
    bio: savedProfile?.bio || "",
    profession: savedProfile?.profession || currentUser?.profession || "barber",
    barberType: savedProfile?.barberType || currentUser?.barberType || "",
    specialty: savedProfile?.specialty || currentUser?.specialty || "unisex",
  });
  // eslint-disable-next-line no-unused-vars
  const [profileError, setProfileError] = useState("");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [profileSaved, setProfileSaved] = useState(false);
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

  // Tracks whether initial profile fetch has been done (prevents re-fetch on derived dep changes)
  const profileFetchedRef = useRef(false);

  // Effect 1: Fetch profile from API once on mount/currentUser.id change only.
  // Uses profileFetchedRef to avoid re-fetching when currentUser.name/phone change (derived deps).
  useEffect(() => {
    if (!currentUser?.id) return;
    if (profileFetchedRef.current) {
      setIsProfileLoading(false);
      return;
    }
    profileFetchedRef.current = true;

    let isMounted = true;

    async function fetchProfile() {
      setIsProfileLoading(true);
      setProfileError("");

      try {
        const { data } = await api.get(`/barbers/profile/${currentUser.id}`);

        if (!isMounted || !data) return;

        const nextProfile = {
          name: data.name || currentUser.name || "",
          city: data.city || "",
          phone: data.phone || currentUser.phone || "",
          imageUrl: data.imageUrl || data.avatarUrl || "",
          bio: data.bio || "",
          profession: data.profession || "barber",
          barberType: data.barberType || "",
          specialty: data.specialty || "unisex",
        };

        setProfile(nextProfile);
        dispatch(
          updateBarberProfile({
            barberId: currentUser.id,
            profile: {
              ...data,
              avatarUrl: data.avatarUrl || data.imageUrl || "",
            },
          })
        );
      } catch (requestError) {
        if (isMounted) {
          setProfileError(
            requestError.response?.data?.message ||
              "Could not load settings. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsProfileLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, currentUser?.name, currentUser?.phone, dispatch]);

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

  // eslint-disable-next-line no-unused-vars
  const updateProfileField = (field, value) => {
    setProfileSaved(false);
    setProfileError("");
    setProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
    }));
  };

  // eslint-disable-next-line no-unused-vars
  const saveProfile = async (event) => {
    event.preventDefault();

    if (!currentUser?.id) return;

    setIsProfileSaving(true);
    setProfileError("");
    setProfileSaved(false);

    try {
      const { data } = await api.put(`/barbers/profile/${currentUser.id}`, {
        name: profile.name,
        city: profile.city,
        phone: profile.phone,
        imageUrl: profile.imageUrl,
        avatarUrl: profile.imageUrl,
        bio: profile.bio,
        profession: profile.profession,
        barberType: profile.barberType,
        specialty: profile.specialty,
      });
      const nextProfile = {
        ...data,
        avatarUrl: data.avatarUrl || data.imageUrl || "",
      };

      dispatch(
        updateBarberProfile({
          barberId: currentUser.id,
          profile: nextProfile,
        })
      );
      dispatch(
        updateCurrentUser({
          name: nextProfile.name,
          city: nextProfile.city,
          phone: nextProfile.phone,
          avatarUrl: nextProfile.avatarUrl,
        })
      );
      setProfile({
        name: nextProfile.name || "",
        city: nextProfile.city || "",
        phone: nextProfile.phone || "",
        imageUrl: nextProfile.imageUrl || nextProfile.avatarUrl || "",
        bio: nextProfile.bio || "",
        profession: nextProfile.profession || profile.profession || "barber",
        barberType: nextProfile.barberType || profile.barberType || "",
        specialty: nextProfile.specialty || profile.specialty || "unisex",
      });
      setProfileSaved(true);
    } catch (requestError) {
      setProfileError(
        requestError.response?.data?.message ||
          "Could not save settings. Please try again."
      );
    } finally {
      setIsProfileSaving(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleAvatarUploaded = (data) => {
    const nextProfile = {
      ...data,
      avatarUrl: data.avatarUrl || data.imageUrl || "",
    };

    dispatch(
      updateBarberProfile({
        barberId: currentUser.id,
        profile: nextProfile,
      })
    );
    dispatch(
      updateCurrentUser({
        name: nextProfile.name,
        city: nextProfile.city,
        phone: nextProfile.phone,
        avatarUrl: nextProfile.avatarUrl,
      })
    );
    setProfile({
      name: nextProfile.name || "",
      city: nextProfile.city || "",
      phone: nextProfile.phone || "",
      imageUrl: nextProfile.imageUrl || nextProfile.avatarUrl || "",
      bio: nextProfile.bio || "",
      profession: nextProfile.profession || profile.profession || "barber",
      barberType: nextProfile.barberType || profile.barberType || "",
      specialty: nextProfile.specialty || profile.specialty || "unisex",
    });
    setProfileSaved(true);
    setProfileError("");
  };

  const refreshSalonData = async () => {
    const [salonsResponse, statusResponse, requestsResponse] = await Promise.all([
      api.get("/salons"),
      api.get("/salons/me/status"),
      api.get("/salons/owner/requests"),
    ]);

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
      setSalonAdmins(adminMap);
      setSalonStaffById(staffMap);
    } else {
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

  const cancelSalonRequest = async (requestId) => {
    const id = requestId || salonStatus.pendingRequest?.id || salonStatus.pendingRequest?._id;

    if (!id || isSalonSaving) return;

    setIsSalonSaving(true);
    setSalonError("");
    setSalonSaved("");

    try {
      await api.put(`/salons/join-requests/${id}/cancel`);
      await refreshSalonData();
      setSalonSaved("Salon request cancelled.");
    } catch (requestError) {
      setSalonError(
        requestError.response?.data?.message ||
          "Could not cancel salon request. Please try again."
      );
    } finally {
      setIsSalonSaving(false);
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
    <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
      <CardContent className="space-y-5 p-4 sm:p-6">
        {settingsView === "hub" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Settings</h2>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SettingsHubCard
                title="Profile"
                description="Edit your name, city, phone, bio, photo and specialty."
                to="/admin/profile"
              />
              <SettingsHubCard
                title="Schedule"
                description="Manage your weekly availability and time off."
                to="/admin/schedule"
              />
              <SettingsHubCard
                title="Salon Settings"
                description="Create, join, or manage your salon memberships."
                to="/admin/settings/salon"
              />
              <SettingsHubCard
                title="Default Schedule"
                description="Set default working hours for each salon."
                to="/admin/settings/default-schedule"
              />
              <SettingsHubCard
                title="Certifications"
                description="Manage your specialist certifications and event certificates."
                to="/admin/settings/certifications"
              />
              <SettingsHubCard
                title="Deposit"
                description="Configure booking deposit / no-show protection settings."
                to="/admin/settings/deposit"
              />
            </div>
          </>
        )}

        {settingsView === "salon" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Salon Settings</h2>
            <p className="text-sm leading-6 text-neutral-500">
              Choose how you work: create your own salon or join an existing one.
            </p>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {isLoading || isProfileLoading ? (
            <p className="text-neutral-500">Loading...</p>
          ) : (
            <>
              {salonStatus.salonStatus !== "none" && (
                <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  You can create and manage multiple salons. Each salon has separate billing, staff, and schedules.
                </p>
              )}
              <SalonSettingsSection
                  allSalonEntries={allSalonEntries}
                  availableSalons={availableSalons}
                  currentUserId={currentUserId}
                  isSalonSaving={isSalonSaving}
                  pendingEntries={pendingEntries}
                  salonDraft={salonDraft}
                  salonError={salonError}
                  salonSaved={salonSaved}
                  salonStatus={salonStatus}
                  selectedSalonId={selectedSalonId}
                  onCancelSalonRequest={cancelSalonRequest}
                  onCreateSalon={createSalon}
                  onOpenLeaveConfirmation={openLeaveSalonConfirmation}
                  onRequestSalonJoin={requestSalonJoin}
                  onSelectedSalonChange={setSelectedSalonId}
                  onUpdateSalonDraft={updateSalonDraft}
                />
                <TeamSettingsSection
                  approvedSalonEntries={salonEntriesWithRelationshipActions}
                  currentUserId={currentUserId}
                  isSalonSaving={isSalonSaving}
                  managedSalons={managedSalons}
                  ownerRequests={ownerRequests}
                  salonAdmins={salonAdmins}
                  salonStaffById={salonStaffById}
                  salons={salons}
                  onDecideSalonRequest={decideSalonRequest}
                  onOpenDemoteConfirmation={openDemoteAdminConfirmation}
                  onOpenPromoteConfirmation={openPromoteAdminConfirmation}
                  onOpenRemoveBarberConfirmation={openRemoveBarberConfirmation}
                  onSaveRelationshipType={saveRelationshipType}
                  onSaveStaffPayment={saveStaffPayment}
                  savingRelationshipKey={savingRelationshipKey}
                  savingPaymentKey={savingPaymentKey}
                />

                {/* Salon Promotions — one manager per managed salon */}
                {managedSalons.map((salon) => {
                  const salonId = salon.id || salon._id;
                  const salonName = salon.name || "Salon";
                  return (
                    <SalonPromotionsManager
                      key={salonId}
                      salonId={salonId}
                      salonName={salonName}
                    />
                  );
                })}
              </>

            )}
          </>
        )}

        {settingsView === "default-schedule" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Default Schedule</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading || isProfileLoading ? (
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
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Salon Promotions</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading || isProfileLoading ? (
              <p className="text-neutral-500">Loading...</p>
            ) : managedSalons.length === 0 ? (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                You need to own or administer a salon to manage salon
                promotions.
              </p>
            ) : (
              <>
                {managedSalons.length > 1 && (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <label className="text-sm font-semibold text-neutral-700">
                      Select salon
                    </label>
                    <select
                      className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                      onChange={(event) =>
                        setSelectedPromotionSalonId(event.target.value)
                      }
                      value={
                        effectivePromotionSalonId
                      }
                    >
                      {managedSalons.map((salon) => {
                        const salonId = salon.id || salon._id;
                        return (
                          <option key={salonId} value={salonId}>
                            {salon.name || "Salon"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {selectedPromotionSalon && (
                  <SalonPromotionsManager
                    salonId={
                      selectedPromotionSalon.id || selectedPromotionSalon._id
                    }
                    salonName={selectedPromotionSalon.name || "Salon"}
                  />
                )}
              </>
            )}
          </>
        )}

        {settingsView === "deposit" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Booking Deposit / No-show Protection</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading || isProfileLoading ? (
              <p className="text-neutral-500">Loading...</p>
            ) : (
              <DepositSettingsSection />
            )}
          </>
        )}

        {settingsView === "certifications" && (
          <>
            <h2 className="text-xl font-bold sm:text-2xl">Certifications</h2>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {isLoading || isProfileLoading ? (
              <p className="text-neutral-500">Loading...</p>
            ) : (
              <>
                <CertificationsManager />
                <EventCertificatesSection eventCertificates={eventCertificates} />
              </>
            )}
          </>
        )}
      </CardContent>

      {confirmation && (
        <ConfirmModal
          confirmLabel={confirmation.confirmLabel}
          disabled={isSalonSaving}
          message={confirmation.message}
          onCancel={closeConfirmation}
          onConfirm={confirmSalonAction}
          title={confirmation.title}
        />
      )}
    </Card>
  );
}
