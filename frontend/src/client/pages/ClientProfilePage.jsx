import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import AccountEmailSection from "@/shared/components/AccountEmailSection";
import AvatarUploadButton from "@/shared/components/AvatarUploadButton";
import { ProfileFormSkeleton } from "@/shared/components/LoadingSkeletons";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { getMediaUrl } from "@/shared/utils/media";

const profileCacheByUserId = new Map();
const CACHE_TTL_MS = 60 * 1000;

export default function ClientProfilePage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const cachedProfileEntry = profileCacheByUserId.get(String(currentUser?.id));
  const cachedProfile = cachedProfileEntry?.profile;
  const [profile, setProfile] = useState({
    name: cachedProfile?.name || currentUser?.name || "",
    city: cachedProfile?.city || currentUser?.city || "",
    phone: cachedProfile?.phone || currentUser?.phone || "",
    avatarUrl: cachedProfile?.avatarUrl || currentUser?.avatarUrl || "",
  });
  const [isLoading, setIsLoading] = useState(!currentUser?.id && !cachedProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Email state
  const [email, setEmail] = useState(
    cachedProfile?.email ?? currentUser?.email ?? ""
  );
  const [savedEmail, setSavedEmail] = useState(
    cachedProfile?.email ?? currentUser?.email ?? ""
  );

  const [emailVerified, setEmailVerified] = useState(
    cachedProfile?.emailVerified ?? currentUser?.emailVerified ?? false
  );
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(
    cachedProfile?.emailVerifiedAt ?? currentUser?.emailVerifiedAt ?? null
  );
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (
        cachedProfileEntry &&
        Date.now() - cachedProfileEntry.loadedAt < CACHE_TTL_MS
      ) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/users/me");

        if (isMounted) {
          const nextProfile = {
            name: data.name || "",
            city: data.city || "",
            phone: data.phone || "",
            avatarUrl: data.avatarUrl || "",
          };

          profileCacheByUserId.set(String(data.id || currentUser?.id), {
            profile: nextProfile,
            loadedAt: Date.now(),
          });
          setProfile(nextProfile);
          const fetchedEmail = data.email ?? "";
          setEmail(fetchedEmail);
          setSavedEmail(fetchedEmail);
          setEmailVerified(Boolean(data.emailVerified));
          setEmailVerifiedAt(data.emailVerifiedAt ?? null);
          dispatch(updateCurrentUser(data));

        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load profile. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [cachedProfileEntry, currentUser?.id, dispatch]);

  const updateField = (field, value) => {
    setSaved(false);
    setProfile((currentProfile) => ({ ...currentProfile, [field]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const { data } = await api.put("/users/me", profile);

      dispatch(updateCurrentUser(data));
      const nextProfile = {
        name: data.name || "",
        city: data.city || "",
        phone: data.phone || "",
        avatarUrl: data.avatarUrl || "",
      };

      profileCacheByUserId.set(String(data.id || currentUser?.id), {
        profile: nextProfile,
        loadedAt: Date.now(),
      });
      setProfile(nextProfile);
      const emailFromSaveProfile = data.email ?? "";
      setEmail(emailFromSaveProfile);
      setSavedEmail(emailFromSaveProfile);
      setEmailVerified(Boolean(data.emailVerified));
      setEmailVerifiedAt(data.emailVerifiedAt ?? null);
      setSaved(true);
    } catch (requestError) {

      setError(
        requestError.response?.data?.message ||
          "Could not save profile. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUploaded = (data) => {
    dispatch(updateCurrentUser(data));
    const nextProfile = {
      name: data.name || "",
      city: data.city || "",
      phone: data.phone || "",
      avatarUrl: data.avatarUrl || data.imageUrl || "",
    };

    profileCacheByUserId.set(String(data.id || currentUser?.id), {
      profile: nextProfile,
      loadedAt: Date.now(),
    });
    setProfile(nextProfile);
    const emailFromAvatarUpload = data.email ?? "";
    setEmail(emailFromAvatarUpload);
    setSavedEmail(emailFromAvatarUpload);
    setEmailVerified(Boolean(data.emailVerified));
    setEmailVerifiedAt(data.emailVerifiedAt ?? null);
    setSaved(true);
    setError("");

  };

  const saveEmail = useCallback(async () => {
    setIsSaving(true);
    setEmailError("");
    setEmailMessage("");

    try {
      const { data } = await api.put("/users/me", { email });
      const savedFromResponse = data.email ?? "";
      dispatch(updateCurrentUser(data));
      setEmail(savedFromResponse);
      setSavedEmail(savedFromResponse);
      setEmailVerified(Boolean(data.emailVerified));
      setEmailVerifiedAt(data.emailVerifiedAt ?? null);

      if (data.email && !data.emailVerified) {
        setEmailMessage("Verification email sent. Check your inbox.");
      } else if (data.email && data.emailVerified) {
        setEmailMessage("Email saved and verified.");
      } else {
        setEmailMessage("Email saved.");
      }
    } catch (requestError) {
      const status = requestError.response?.status;
      const msg =
        requestError.response?.data?.message ||
        "Could not save email. Please try again.";
      if (status === 429) {
        setEmailError(msg);
      } else {
        setEmailError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  }, [email, dispatch]);

  const resendVerification = useCallback(async () => {
    setIsSending(true);
    setEmailError("");
    setEmailMessage("");

    try {
      const { data } = await api.post("/users/me/email/verification");
      setEmailMessage(data.message || "Verification email sent. Check your inbox.");
    } catch (requestError) {
      const status = requestError.response?.status;
      const msg =
        requestError.response?.data?.message ||
        "Could not send verification email. Please try again.";
      if (status === 429) {
        setEmailError(msg);
      } else {
        setEmailError(msg);
      }
    } finally {
      setIsSending(false);
    }
  }, []);

  const onEmailChange = useCallback((value) => {
    setEmail(value);
    setEmailMessage("");
    setEmailError("");
  }, []);

  const normalizedInputEmail = (email ?? "").trim().toLowerCase();
  const normalizedSavedEmail = (savedEmail ?? "").trim().toLowerCase();
  const hasEmailChanges = normalizedInputEmail !== normalizedSavedEmail;

  const hasUsableProfile = Boolean(
    currentUser?.id || profile.name || profile.phone || profile.city || profile.avatarUrl
  );

  const initialLoading = isLoading && !hasUsableProfile;
  const refreshing = isLoading && hasUsableProfile;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
            <p className="mt-2 text-neutral-500">
              Keep your booking contact details up to date.
            </p>
          </div>

          {refreshing && (
            <p className="text-sm text-neutral-500">Refreshing profile...</p>
          )}

          {initialLoading ? (
            <ProfileFormSkeleton />
          ) : (
            <form className="space-y-4" onSubmit={saveProfile}>
              <label className="grid gap-2 text-sm font-semibold">
                Name
                <input
                  className="w-full rounded-2xl border p-3 font-normal"
                  placeholder="Name"
                  value={profile.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                City
                <input
                  className="w-full rounded-2xl border p-3 font-normal"
                  placeholder="City"
                  value={profile.city}
                  onChange={(event) => updateField("city", event.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Phone
                <input
                  className="w-full rounded-2xl border p-3 font-normal"
                  placeholder="Phone"
                  value={profile.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Avatar URL
                <input
                  className="w-full rounded-2xl border p-3 font-normal"
                  placeholder="Avatar URL"
                  value={profile.avatarUrl}
                  onChange={(event) => updateField("avatarUrl", event.target.value)}
                />
              </label>

              <AvatarUploadButton
                disabled={isSaving}
                label={profile.avatarUrl ? "Change image" : "Add image"}
                uploadUrl="/users/me"
                onUploaded={handleAvatarUploaded}
              />

              {saved && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Profile saved.
                </p>
              )}
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save profile"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Email card */}
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <AccountEmailSection
            email={email}
            emailVerified={emailVerified}
            emailVerifiedAt={emailVerifiedAt}
            isSaving={isSaving}
            isSending={isSending}
            message={emailMessage}
            error={emailError}
            onEmailChange={onEmailChange}
            onResend={resendVerification}
          />

          <Button
            disabled={!hasEmailChanges || isSaving}
            variant="outline"
            onClick={saveEmail}
          >
            {isSaving ? "Saving..." : "Save email"}
          </Button>

        </CardContent>
      </Card>

      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-4 sm:p-6">
          {profile.avatarUrl ? (
            <img
              alt={profile.name || "Profile avatar"}
              className="aspect-square w-full rounded-2xl object-cover"
              src={getMediaUrl(profile.avatarUrl)}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
              No avatar
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold">{profile.name || "Name"}</h2>
            <p className="text-sm text-neutral-500">{profile.phone || "Phone"}</p>
            <p className="text-sm text-neutral-500">{profile.city || "City"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
