import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getMyBarberOnboarding } from "@/shared/api/barberOnboarding";
import ProfileFormCard from "@/barber/components/profile/ProfileFormCard";
import { Button } from "@/shared/components/ui/button";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { updateBarberProfile } from "@/store/slices/usersSlice";

const buildInitialProfile = (user = {}) => ({
  name: user.name || "",
  phone: user.phone || "",
  bio: user.bio || "",
  city: user.city || "",
  address: "",
  instagram: user.instagram || "",
  profession: user.profession || "barber",
  barberType: user.barberType || "unisex",
  specialty: user.specialty || "unisex",
  imageUrl: user.imageUrl || user.avatarUrl || "",
  galleryImages: user.galleryImages || [],
  defaultSchedule: user.defaultSchedule,
  salon: user.salon || null,
  salonStatus: user.salonStatus || "none",
  workHistory: user.workHistory || [],
  approvedSalons: user.approvedSalons || user.salons || [],
  primarySalon: user.primarySalon || null,
  salons: user.salons || [],
});

const normalizeProfile = (data, fallback) => ({
  ...fallback,
  name: data?.name || fallback.name,
  phone: data?.phone || fallback.phone,
  bio: data?.bio || fallback.bio || "",
  city: data?.city || fallback.city || "",
  address: data?.address || fallback.address || "",
  instagram: data?.instagram || fallback.instagram || "",
  profession: data?.profession || fallback.profession || "barber",
  barberType: data?.barberType || fallback.barberType || "unisex",
  specialty: data?.specialty || fallback.specialty || "unisex",
  imageUrl: data?.imageUrl || data?.avatarUrl || fallback.imageUrl || "",
  avatarUrl: data?.avatarUrl || data?.imageUrl || fallback.avatarUrl || "",
  galleryImages: data?.galleryImages || fallback.galleryImages || [],
  defaultSchedule: data?.defaultSchedule || fallback.defaultSchedule,
  salon: data?.salon || fallback.salon || null,
  salonStatus: data?.salonStatus || fallback.salonStatus || "none",
  workHistory: data?.workHistory || fallback.workHistory || [],
  approvedSalons: data?.approvedSalons || data?.salons || fallback.approvedSalons || [],
  primarySalon: data?.primarySalon || fallback.primarySalon || null,
  salons: data?.salons || fallback.salons || [],
});

export default function ProfessionalBasicsStep({
  mode = "basics",
  onStatusChange,
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const mountedRef = useRef(false);
  const tokenRef = useRef(0);
  const [profile, setProfile] = useState(() => buildInitialProfile(currentUser));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const isActive = useCallback(
    (token) => mountedRef.current && tokenRef.current === token,
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    const token = ++tokenRef.current;

    async function loadProfile() {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/users/me");
        if (!isActive(token)) return;
        setProfile((current) => normalizeProfile(data, current));
      } catch {
        if (isActive(token)) setError("Could not load profile. Please try again.");
      } finally {
        if (isActive(token)) setIsLoading(false);
      }
    }

    loadProfile();

    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
    };
  }, [isActive]);

  const updateField = (field, value) => {
    setSaved(false);
    setError("");
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!currentUserId || isSaving) return;

    const token = ++tokenRef.current;
    setIsSaving(true);
    setSaved(false);
    setError("");

    try {
      const payload = { ...profile, addressContext: undefined };
      const { data } = await api.put(`/barbers/profile/${currentUserId}`, payload);
      if (!isActive(token)) return;

      const nextProfile = normalizeProfile(data, profile);
      setProfile(nextProfile);
      setSaved(true);
      // Dispatch only public-safe fields — strip private address
      const publicProfile = { ...nextProfile };
      delete publicProfile.address;
      dispatch(updateBarberProfile({ barberId: currentUserId, profile: publicProfile }));
      dispatch(
        updateCurrentUser({
          name: nextProfile.name,
          phone: nextProfile.phone,
          city: nextProfile.city,
          avatarUrl: nextProfile.avatarUrl,
          profession: nextProfile.profession,
          barberType: nextProfile.barberType,
          specialty: nextProfile.specialty,
        })
      );

      const status = await getMyBarberOnboarding();
      if (!isActive(token)) return;
      onStatusChange?.(status);
    } catch {
      if (isActive(token)) setError("Could not save profile. Please try again.");
    } finally {
      if (isActive(token)) setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        Loading profile...
      </div>
    );
  }

  if (mode === "address") {
    return (
      <form
        className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        onSubmit={saveProfile}
      >
        <div className="space-y-1">
          <h3 className="text-base font-bold text-neutral-950">
            Add your private address
          </h3>
          <p className="text-sm leading-6 text-neutral-700">
            Independent and both workplace choices need a private address before
            onboarding can be finalized.
          </p>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-neutral-900">
          Address
          <input
            className="w-full rounded-2xl border border-amber-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            disabled={isSaving}
            placeholder="Private address"
            value={profile.address}
            onChange={(event) => updateField("address", event.target.value)}
          />
        </label>

        {saved && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Address saved.
          </p>
        )}
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button disabled={isSaving} type="submit" variant="primary">
          {isSaving ? "Saving..." : "Save address"}
        </Button>
      </form>
    );
  }

  return (
    <ProfileFormCard
      profile={profile}
      isProfileSaving={isSaving}
      saved={saved}
      profileError={error}
      currentUser={currentUser}
      onUpdateField={updateField}
      onSaveProfile={saveProfile}
      editable
      variant="basics"
    />
  );
}
