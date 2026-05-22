import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import AccountEmailSection from "@/shared/components/AccountEmailSection";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { updateBarberProfile } from "@/store/slices/usersSlice";
import { defaultPersonalSchedule } from "@/shared/data/schedule";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import ProfileSidebarCard from "@/barber/components/profile/ProfileSidebarCard";
import ProfileFormCard from "@/barber/components/profile/ProfileFormCard";
import CertificationsSection from "@/barber/components/profile/CertificationsSection";
import ReviewsSection from "@/barber/components/profile/ReviewsSection";
import GallerySection from "@/barber/components/profile/GallerySection";
import ProfileWorkHistorySection from "@/barber/components/profile/ProfileWorkHistorySection";

function getPrimarySalonId(user) {
  const approvedSalons = (user?.approvedSalons || user?.salons || []).filter(
    (salon) => salon?.status === "approved" || salon?.status === undefined
  );
  const primarySalon =
    user?.primarySalon ||
    approvedSalons.find((salon) => salon?.isPrimary) ||
    approvedSalons[0];
  const legacySalon = user?.salonStatus === "approved" ? user?.salon : null;

  return (
    primarySalon?.id ||
    primarySalon?._id ||
    legacySalon?.id ||
    legacySalon?._id ||
    null
  );
}

export default function BarberProfilePage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name || "";
  const currentUserPhone = currentUser?.phone || "";
  const currentUserSalonId = getPrimarySalonId(currentUser);
  const savedProfile = useSelector((state) =>
    state.users.find((user) => user.id === currentUserId)
  );
  const reviews = useSelector((state) => state.reviews);
  const clients = useSelector((state) => state.users);
  const safeReviews = reviews || [];
  const barberReviews = safeReviews.filter(
    (review) => String(review.barberId) === String(currentUserId)
  );
  const averageRating =
    barberReviews.length > 0
      ? barberReviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0) /
        barberReviews.length
      : 0;
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isReviewsLoading, setIsReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [certifications, setCertifications] = useState([]);
  const [eventCertifications, setEventCertifications] = useState([]);
  const [salonRating, setSalonRating] = useState(null);
  const [salonReviewsCount, setSalonReviewsCount] = useState(0);

  // Email state (separate from public profile state)
  const [email, setEmail] = useState(
    currentUser?.email ?? ""
  );
  const [savedEmail, setSavedEmail] = useState(
    currentUser?.email ?? ""
  );

  const [emailVerified, setEmailVerified] = useState(
    Boolean(currentUser?.emailVerified)
  );
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(
    currentUser?.emailVerifiedAt ?? null
  );
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEmailSaving, setIsEmailSaving] = useState(false);

  const [profile, setProfile] = useState({
    name: currentUserName,
    phone: currentUserPhone,
    bio: savedProfile?.bio || "",
    city: savedProfile?.city || currentUser?.city || "",
    address: savedProfile?.address || "",
    instagram: savedProfile?.instagram || "",
    specialty: savedProfile?.specialty || currentUser?.specialty || "unisex",
    imageUrl: savedProfile?.imageUrl || currentUser?.avatarUrl || "",
    galleryImages: savedProfile?.galleryImages || [],
    defaultSchedule: savedProfile?.defaultSchedule || defaultPersonalSchedule,
    salon: savedProfile?.salon || null,
    salonStatus: savedProfile?.salonStatus || currentUser?.salonStatus || "none",
    workHistory: savedProfile?.workHistory || currentUser?.workHistory || [],
  });
  const galleryImages = profile?.galleryImages || [];
  const hasCertifications =
    certifications.length > 0 || eventCertifications.length > 0;

  // Get approved salons from new salons array, fallback to legacy
  const approvedSalons = (profile?.approvedSalons || profile?.salons || [])
    .filter((s) => s?.status === "approved" || s?.status === undefined);
  const primarySalon = profile?.primarySalon || approvedSalons.find((s) => s?.isPrimary) || approvedSalons[0];
  const legacySalon = profile?.salonStatus === "approved" ? profile?.salon : null;

  // Build salon display
  let salonName = "";
  let salonId = null;
  let showSalonLink = false;

  if (approvedSalons.length > 1) {
    const primaryName = primarySalon?.name || "";
    const extraCount = approvedSalons.length - 1;
    salonName = `${primaryName} + ${extraCount} more`;
    salonId = primarySalon?.id || primarySalon?._id;
    showSalonLink = Boolean(primaryName && salonId);
  } else if (approvedSalons.length === 1) {
    const salon = approvedSalons[0];
    salonName = salon?.name || "";
    salonId = salon?.id || salon?._id;
    showSalonLink = Boolean(salonName && salonId);
  } else if (legacySalon) {
    salonName = legacySalon?.name || "";
    salonId = legacySalon?.id || legacySalon?._id;
    showSalonLink = Boolean(salonName && salonId);
  }

  useEffect(() => {
    if (!currentUserId) return;

    let isMounted = true;

    async function fetchProfile() {
      setProfileError("");

      try {
        const { data } = await api.get(`/barbers/profile/${currentUserId}`);

        if (isMounted && data) {
          setProfile({
            name: data.name || currentUserName,
            phone: data.phone || currentUserPhone,
            bio: data.bio || "",
            city: data.city || "",
            address: data.address || "",
            instagram: data.instagram || "",
            specialty: data.specialty || "",
            imageUrl: data.imageUrl || "",
            galleryImages: data.galleryImages || [],
            defaultSchedule: data.defaultSchedule || defaultPersonalSchedule,
            salon: data.salon || null,
            salonStatus: data.salonStatus || "none",
            workHistory: data.workHistory || [],
          });
        }
      } catch (requestError) {
        if (isMounted) {
          setProfileError(
            requestError.response?.data?.message ||
              "Could not load profile. Please try again."
          );
        }
      }
    }

    async function fetchReviews() {
      setIsReviewsLoading(true);
      setReviewsError("");

      try {
        const { data } = await api.get(`/reviews/${currentUserId}`);

        if (isMounted) {
          dispatch(
            setReviews({
              barberId: currentUserId,
              reviews: data,
            })
          );
        }
      } catch (requestError) {
        if (isMounted) {
          setReviewsError(
            requestError.response?.data?.message ||
              "Could not load reviews. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsReviewsLoading(false);
        }
      }
    }

    async function fetchCertifications() {
      try {
        const [manualResponse, eventResponse] = await Promise.all([
          api.get(`/barbers/${currentUserId}/certifications`),
          api.get(`/barbers/${currentUserId}/event-certificates`),
        ]);
        if (isMounted) {
          setCertifications(manualResponse.data || []);
          setEventCertifications(eventResponse.data || []);
        }
      } catch {
        // Certifications are optional, silently fail
      }
    }

    fetchProfile();
    fetchReviews();
    fetchCertifications();

    // Fetch salon review stats if barber belongs to approved salons
    if (currentUserSalonId) {
      api.get(`/salons/${currentUserSalonId}`)
        .then(({ data }) => {
          if (isMounted) {
            setSalonRating(Number(data?.averageRating || 0));
            setSalonReviewsCount(
              Number(data?.totalReviews ?? data?.reviewsCount ?? 0)
            );
          }
        })
        .catch(() => {
          // Salon stats are optional
        });
    }

    // Fetch email state from /users/me (separate from public barber profile)
    api.get("/users/me")
      .then(({ data }) => {
        if (isMounted) {
          const fetchedEmail = data.email ?? "";
          setEmail(fetchedEmail);
          setSavedEmail(fetchedEmail);
          setEmailVerified(Boolean(data.emailVerified));
          setEmailVerifiedAt(data.emailVerifiedAt ?? null);
          dispatch(updateCurrentUser(data));
        }
      })

      .catch(() => {
        // Silent
      });

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentUserName, currentUserPhone, currentUserSalonId, dispatch]);

  const updateField = (field, value) => {
    setSaved(false);
    setProfile((currentProfile) => ({ ...currentProfile, [field]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    if (isProfileSaving) return;

    setProfileError("");
    setIsProfileSaving(true);

    try {
      const { data } = await api.put(`/barbers/profile/${currentUser.id}`, profile);
      const nextProfile = {
        name: data.name || profile.name,
        phone: data.phone || profile.phone,
        bio: data.bio || "",
        city: data.city || "",
        address: data.address || "",
        instagram: data.instagram || "",
        specialty: data.specialty || profile.specialty || "unisex",
        imageUrl: data.imageUrl || "",
        avatarUrl: data.avatarUrl || data.imageUrl || "",
        galleryImages: data.galleryImages || [],
        defaultSchedule: data.defaultSchedule || profile.defaultSchedule,
        salon: data.salon || profile.salon || null,
        salonStatus: data.salonStatus || profile.salonStatus || "none",
      };

      dispatch(updateBarberProfile({ barberId: currentUser.id, profile: nextProfile }));
      dispatch(
        updateCurrentUser({
          name: nextProfile.name,
          phone: nextProfile.phone,
          city: nextProfile.city,
          avatarUrl: nextProfile.avatarUrl,
        })
      );
      setProfile(nextProfile);
      setSaved(true);
    } catch (requestError) {
      setProfileError(
        requestError.response?.data?.message ||
          "Could not save profile. Please try again."
      );
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleAvatarUploaded = (data) => {
    const nextProfile = {
      name: data.name || profile.name,
      phone: data.phone || profile.phone,
      bio: data.bio || "",
      city: data.city || "",
      address: data.address || "",
      instagram: data.instagram || "",
      specialty: data.specialty || profile.specialty || "unisex",
      imageUrl: data.imageUrl || data.avatarUrl || "",
      avatarUrl: data.avatarUrl || data.imageUrl || "",
      galleryImages: data.galleryImages || [],
      defaultSchedule: data.defaultSchedule || profile.defaultSchedule,
      salon: data.salon || profile.salon || null,
      salonStatus: data.salonStatus || profile.salonStatus || "none",
    };

    dispatch(updateBarberProfile({ barberId: currentUser.id, profile: nextProfile }));
    dispatch(
      updateCurrentUser({
        name: nextProfile.name,
        phone: nextProfile.phone,
        city: nextProfile.city,
        avatarUrl: nextProfile.avatarUrl,
      })
    );
    setProfile(nextProfile);
    setSaved(true);
    setProfileError("");
  };

  const addGalleryImage = () => {
    const nextUrl = galleryUrl.trim();

    if (!nextUrl || galleryImages.includes(nextUrl)) return;

    setSaved(false);
    setProfile((currentProfile) => ({
      ...currentProfile,
      galleryImages: [...(currentProfile.galleryImages || []), nextUrl],
    }));
    setGalleryUrl("");
  };

  const removeGalleryImage = (imageUrl) => {
    setSaved(false);
    setProfile((currentProfile) => ({
      ...currentProfile,
      galleryImages: (currentProfile.galleryImages || []).filter(
        (item) => item !== imageUrl
      ),
    }));
  };

  //── Email handlers (use /users/me, not /barbers/profile/:id) ──────

  const saveEmail = useCallback(async () => {
    setIsEmailSaving(true);
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
      setEmailError(
        requestError.response?.data?.message ||
          "Could not save email. Please try again."
      );
    } finally {
      setIsEmailSaving(false);
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
      setEmailError(
        requestError.response?.data?.message ||
          "Could not send verification email. Please try again."
      );
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

  if (!currentUser?.id) {

    return <p className="text-neutral-500">Profile not found</p>;
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <ProfileFormCard
          profile={profile}
          isProfileSaving={isProfileSaving}
          saved={saved}
          profileError={profileError}
          galleryUrl={galleryUrl}
          galleryImages={galleryImages}
          currentUser={currentUser}
          onUpdateField={updateField}
          onSaveProfile={saveProfile}
          onAvatarUploaded={handleAvatarUploaded}
          onGalleryUrlChange={setGalleryUrl}
          onAddGalleryImage={addGalleryImage}
          onRemoveGalleryImage={removeGalleryImage}
        />

        <ProfileSidebarCard
          profile={profile}
          currentUser={currentUser}
          showSalonLink={showSalonLink}
          salonName={salonName}
          salonId={salonId}
          salonRating={salonRating}
          salonReviewsCount={salonReviewsCount}
        />
      </div>

      <section className="w-full">
        <GallerySection images={galleryImages} />
      </section>

      {hasCertifications && (
        <section className="w-full">
          <CertificationsSection
            certifications={certifications}
            eventCertifications={eventCertifications}
          />
        </section>
      )}

      <section className="w-full">
        <ProfileWorkHistorySection
          currentUser={currentUser}
          savedProfile={profile}
        />
      </section>

      <section className="w-full">
        <ReviewsSection
          reviews={barberReviews}
          reviewsAverage={averageRating}
          reviewsError={reviewsError}
          isReviewsLoading={isReviewsLoading}
          clients={clients}
        />
      </section>

      <section className="w-full">
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-5 p-4 sm:p-6">
            <AccountEmailSection
              email={email}
              emailVerified={emailVerified}
              emailVerifiedAt={emailVerifiedAt}
              isSaving={isEmailSaving}
              isSending={isSending}
              message={emailMessage}
              error={emailError}
              onEmailChange={onEmailChange}
              onResend={resendVerification}
            />

            <Button
              disabled={!hasEmailChanges || isEmailSaving}
              variant="outline"
              onClick={saveEmail}
            >
              {isEmailSaving ? "Saving..." : "Save email"}
            </Button>

          </CardContent>
        </Card>
      </section>
    </div>
  );
}
