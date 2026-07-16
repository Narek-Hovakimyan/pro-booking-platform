import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import useProfileEmail from "@/barber/hooks/useProfileEmail";

import api from "@/shared/api/axios";
import { getMyPortfolio } from "@/shared/api/portfolio";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { updateBarberProfile } from "@/store/slices/usersSlice";
import { defaultPersonalSchedule } from "@/shared/data/schedule";
import ProfileSidebarCard from "@/barber/components/profile/ProfileSidebarCard";
import CertificationsSection from "@/barber/components/profile/CertificationsSection";
import ReviewsSection from "@/barber/components/profile/ReviewsSection";
import ProfileWorkHistorySection from "@/barber/components/profile/ProfileWorkHistorySection";
import GallerySection from "@/barber/components/profile/GallerySection";
import ProfilePageHeader from "@/barber/components/profile/ProfilePageHeader";
import ProfileStatsGrid from "@/barber/components/profile/ProfileStatsGrid";
import { Card, CardContent } from "@/shared/components/ui/card";
import ProfileFormCard from "@/barber/components/profile/ProfileFormCard";
import ProfileEditDrawer from "@/barber/components/profile/ProfileEditDrawer";
import ProfileAboutCard from "@/barber/components/profile/ProfileAboutCard";
import ProfilePortfolioCard from "@/barber/components/profile/ProfilePortfolioCard";
import ProfileSalonCard from "@/barber/components/profile/ProfileSalonCard";

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

const professionLabels = {
  barber: "Barber",
  hair_stylist: "Hair stylist",
  nail_master: "Nail master",
  makeup_artist: "Makeup artist",
  cosmetologist: "Cosmetologist",
  lash_brow: "Lash & Brow",
  massage: "Massage therapist",
  other: "Specialist",
};

const barberTypeLabels = {
  men: "Men's barber",
  women: "Women's hairdresser",
  unisex: "Unisex",
};

const getProfileHeadline = (profile) => {
  const profession = professionLabels[profile?.profession] || "Specialist";
  const barberType =
    profile?.profession === "barber"
      ? barberTypeLabels[profile?.barberType]
      : "";

  return [profession, barberType].filter(Boolean).join(" · ");
};

export default function BarberProfilePage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name || "";
  const currentUserPhone = currentUser?.phone || "";
  const currentUserSalonStatus = currentUser?.salonStatus || "none";
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
  const [certifications, setCertifications] = useState([]);
  const [eventCertifications, setEventCertifications] = useState([]);
  const [salonRating, setSalonRating] = useState(null);
  const [salonReviewsCount, setSalonReviewsCount] = useState(0);
  const [servicesCount, setServicesCount] = useState(null);
  const [portfolioCount, setPortfolioCount] = useState(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const selfAddressContext = currentUserId ? `barber:${currentUserId}` : "";
  const selfAddressContextRef = useRef(selfAddressContext);
  const selfAddressRequestRef = useRef(0);
  const addressEditedRef = useRef(false);
  const selfAddressHydratedRef = useRef(false);

  const {
    email,
    emailVerified,
    emailVerifiedAt,
    isEmailSaving,
    isSending,
    emailMessage,
    emailError,
    onEmailChange,
    saveEmail,
    resendVerification,
    loadFromUsersMe,
    hasEmailChanges,
  } = useProfileEmail({ currentUser, dispatch });

  const [profileState, setProfile] = useState({
    name: currentUserName,
    phone: currentUserPhone,
    bio: savedProfile?.bio || "",
    city: savedProfile?.city || currentUser?.city || "",
    address: "",
    instagram: savedProfile?.instagram || "",
    profession: savedProfile?.profession || currentUser?.profession || "barber",
    barberType: savedProfile?.barberType || currentUser?.barberType || "",
    specialty: savedProfile?.specialty || currentUser?.specialty || "unisex",
    imageUrl: savedProfile?.imageUrl || currentUser?.avatarUrl || "",
    galleryImages: savedProfile?.galleryImages || [],
    defaultSchedule: savedProfile?.defaultSchedule || defaultPersonalSchedule,
    salon: savedProfile?.salon || null,
    salonStatus: savedProfile?.salonStatus || currentUserSalonStatus,
    workHistory: savedProfile?.workHistory || currentUser?.workHistory || [],
    approvedSalons: savedProfile?.approvedSalons || savedProfile?.salons || [],
    primarySalon: savedProfile?.primarySalon || null,
    salons: savedProfile?.salons || [],
    addressContext: selfAddressContext,
  });
  const profile =
    profileState.addressContext === selfAddressContext
      ? profileState
      : { ...profileState, address: "" };
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

  useLayoutEffect(() => {
    selfAddressContextRef.current = selfAddressContext;
    selfAddressRequestRef.current += 1;
    addressEditedRef.current = false;
    selfAddressHydratedRef.current = false;
  }, [selfAddressContext]);

  useEffect(() => {
    if (!currentUserId) return;

    let isMounted = true;

    async function fetchProfile() {
      setProfileError("");

      try {
        const { data } = await api.get(`/barbers/profile/${currentUserId}`);

        if (isMounted && data) {
          setProfile((currentProfile) => ({
            name: data.name || currentUserName,
            phone: data.phone || currentUserPhone,
            bio: data.bio || "",
            city: data.city || "",
            address: currentProfile.address,
            addressContext: currentProfile.addressContext,
            instagram: data.instagram || "",
            profession: data.profession || "barber",
            barberType: data.barberType || "",
            specialty: data.specialty || "",
            imageUrl: data.imageUrl || "",
            galleryImages: data.galleryImages || [],
            defaultSchedule: data.defaultSchedule || defaultPersonalSchedule,
            salon: data.salon || null,
            salonStatus: currentUserSalonStatus,
            workHistory: data.workHistory || [],
            approvedSalons: data.approvedSalons || data.salons || [],
            primarySalon: data.primarySalon || null,
            salons: data.salons || [],
          }));
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

    api.get(`/services/${currentUserId}`)
      .then(({ data }) => {
        if (isMounted) {
          const activeServices = (data || []).filter(
            (service) => service?.active !== false
          );
          setServicesCount(activeServices.length);
        }
      })
      .catch(() => {
        if (isMounted) setServicesCount(null);
      });

    getMyPortfolio()
      .then((items) => {
        if (isMounted) {
          setPortfolioCount(Array.isArray(items) ? items.length : null);
        }
      })
      .catch(() => {
        if (isMounted) setPortfolioCount(null);
      });

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

    const requestContext = selfAddressContext;
    const requestId = ++selfAddressRequestRef.current;

    // Fetch email state from /users/me (separate from public barber profile)
    api.get("/users/me")
      .then(({ data }) => {
        if (
          isMounted &&
          selfAddressContextRef.current === requestContext &&
          selfAddressRequestRef.current === requestId
        ) {
          loadFromUsersMe(data);
          if (!addressEditedRef.current) {
            selfAddressHydratedRef.current = true;
            setProfile((currentProfile) => ({
              ...currentProfile,
              address: typeof data?.address === "string" ? data.address : currentProfile.address,
              addressContext: requestContext,
            }));
          }
        }
      })

      .catch(() => {
        // Silent
      });

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentUserName, currentUserPhone, currentUserSalonId, currentUserSalonStatus, dispatch, loadFromUsersMe, selfAddressContext]);

  const updateField = (field, value) => {
    if (field === "address") {
      addressEditedRef.current = true;
      selfAddressHydratedRef.current = true;
    }
    setSaved(false);
    setProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
      ...(field === "address" ? { addressContext: selfAddressContext } : {}),
    }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    if (isProfileSaving) return;

    setProfileError("");
    setIsProfileSaving(true);

    try {
      const profilePayload = {
        ...profile,
        addressContext: undefined,
      };
      if (!selfAddressHydratedRef.current) profilePayload.address = undefined;
      const { data } = await api.put(`/barbers/profile/${currentUser.id}`, profilePayload);
      const nextProfile = {
        name: data.name || profile.name,
        phone: data.phone || profile.phone,
        bio: data.bio || "",
        city: data.city || "",
        address: data.address || "",
        instagram: data.instagram || "",
        profession: data.profession || profile.profession || "barber",
        barberType: data.barberType || profile.barberType || "",
        specialty: data.specialty || profile.specialty || "unisex",
        imageUrl: data.imageUrl || "",
        avatarUrl: data.avatarUrl || data.imageUrl || "",
        galleryImages: data.galleryImages || [],
        defaultSchedule: data.defaultSchedule || profile.defaultSchedule,
        salon: data.salon || profile.salon || null,
        salonStatus: data.salonStatus || profile.salonStatus || "none",
        workHistory: data.workHistory || profile.workHistory || [],
        approvedSalons: data.approvedSalons || data.salons || profile.approvedSalons || [],
        primarySalon: data.primarySalon || profile.primarySalon || null,
        salons: data.salons || profile.salons || [],
      };

      dispatch(updateBarberProfile({ barberId: currentUser.id, profile: nextProfile }));
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
      setProfile({ ...nextProfile, addressContext: selfAddressContext });
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
      bio: data.bio ?? profile.bio ?? "",
      city: data.city ?? profile.city ?? "",
      address: data.address ?? profile.address ?? "",
      instagram: data.instagram ?? profile.instagram ?? "",
      profession: data.profession || profile.profession || "barber",
      barberType: data.barberType || profile.barberType || "",
      specialty: data.specialty || profile.specialty || "unisex",
      imageUrl: data.imageUrl || data.avatarUrl || profile.imageUrl || "",
      avatarUrl: data.avatarUrl || data.imageUrl || "",
      galleryImages: data.galleryImages || profile.galleryImages || [],
      defaultSchedule: data.defaultSchedule || profile.defaultSchedule,
      salon: data.salon || profile.salon || null,
      salonStatus: data.salonStatus || profile.salonStatus || "none",
      workHistory: data.workHistory || profile.workHistory || [],
      approvedSalons: data.approvedSalons || data.salons || profile.approvedSalons || [],
      primarySalon: data.primarySalon || profile.primarySalon || null,
      salons: data.salons || profile.salons || [],
    };

    dispatch(updateBarberProfile({ barberId: currentUser.id, profile: nextProfile }));
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
    setProfile({ ...nextProfile, addressContext: selfAddressContext });
    setSaved(true);
    setProfileError("");
  };

  //── Email handlers (use /users/me, not /barbers/profile/:id) ──────

  const headline = getProfileHeadline(profile);
  const instagramHandle = profile.instagram?.trim() || "";
  const instagramHref = instagramHandle
    ? instagramHandle.startsWith("http")
      ? instagramHandle
      : `https://instagram.com/${instagramHandle.replace(/^@/, "")}`
    : "";
  const statRating =
    barberReviews.length > 0 && averageRating > 0
      ? averageRating.toFixed(1)
      : "No rating";
  const statReviews =
    barberReviews.length > 0 ? String(barberReviews.length) : "No reviews";
  const statServices =
    servicesCount === null ? "Add services" : String(servicesCount);
  const statPortfolio =
    portfolioCount === null ? "Portfolio" : String(portfolioCount);

  if (!currentUser?.id) {

    return <p className="text-neutral-500">Profile not found</p>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/80 to-neutral-50">
      <ProfilePageHeader
        headline={headline}
        onEditClick={() => setIsEditDrawerOpen(true)}
        saved={saved}
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <ProfileStatsGrid
          statRating={statRating}
          statReviews={statReviews}
          statServices={statServices}
          statPortfolio={statPortfolio}
          barberReviews={barberReviews}
        />

        {/* Two-column desktop layout */}
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Left sidebar */}
          <div className="space-y-5">
            <ProfileSidebarCard
              profile={profile}
              currentUser={currentUser}
              showSalonLink={showSalonLink}
              salonName={salonName}
              salonId={salonId}
              reviewsAverage={averageRating}
              reviewsCount={barberReviews.length}
              salonRating={salonRating}
              salonReviewsCount={salonReviewsCount}
            />
          </div>

          {/* Right main content */}
          <div className="space-y-5">
            <ProfileFormCard
              profile={profile}
              isProfileSaving={isProfileSaving}
              saved={saved}
              profileError={profileError}
              currentUser={currentUser}
              editable={false}
            />

            <ProfileAboutCard
              bio={profile.bio}
              city={profile.city}
              address={profile.address}
              instagramHref={instagramHref}
              instagramHandle={instagramHandle}
            />

            <ProfilePortfolioCard portfolioCount={portfolioCount} />

            <GallerySection images={profile.galleryImages} />

            {/* Certifications */}
            {hasCertifications ? (
              <CertificationsSection
                certifications={certifications}
                eventCertifications={eventCertifications}
              />
            ) : (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
                  <h2 className="font-bold text-white">Certifications</h2>
                </div>
                <CardContent className="p-5">
                  <p className="text-sm text-neutral-500">
                    No certifications added yet.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Work History */}
            <ProfileWorkHistorySection
              currentUser={currentUser}
              savedProfile={profile}
            />

            {/* Reviews */}
            <ReviewsSection
              reviews={barberReviews}
              reviewsAverage={averageRating}
              reviewsError={reviewsError}
              isReviewsLoading={isReviewsLoading}
              clients={clients}
            />
          </div>
        </div>

        <ProfileSalonCard
          showSalonLink={showSalonLink}
          salonName={salonName}
          salonId={salonId}
          salonRating={salonRating}
          salonReviewsCount={salonReviewsCount}
        />
      </div>

      <ProfileEditDrawer
        isOpen={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
        profile={profile}
        updateField={updateField}
        saveProfile={saveProfile}
        isProfileSaving={isProfileSaving}
        profileError={profileError}
        currentUser={currentUser}
        saved={saved}
        email={email}
        emailVerified={emailVerified}
        emailVerifiedAt={emailVerifiedAt}
        isEmailSaving={isEmailSaving}
        isSending={isSending}
        emailMessage={emailMessage}
        emailError={emailError}
        onEmailChange={onEmailChange}
        saveEmail={saveEmail}
        resendVerification={resendVerification}
        hasEmailChanges={hasEmailChanges}
        handleAvatarUploaded={handleAvatarUploaded}
      />
    </div>
  );
}
