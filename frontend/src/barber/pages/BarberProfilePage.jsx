import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  BriefcaseBusiness,
  Camera,
  Image,
  AtSign,
  MapPin,
  Pencil,
  Scissors,
  Star,
} from "lucide-react";

import api from "@/shared/api/axios";
import { getMyPortfolio } from "@/shared/api/portfolio";
import AccountEmailSection from "@/shared/components/AccountEmailSection";
import Drawer from "@/shared/components/common/Drawer";
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
import ProfileWorkHistorySection from "@/barber/components/profile/ProfileWorkHistorySection";
import GallerySection from "@/barber/components/profile/GallerySection";

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

function StatCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-lg font-bold text-neutral-950">{value}</p>
          <p className="text-xs font-medium text-neutral-500">{label}</p>
        </div>
      </div>
      {helper && <p className="mt-2 text-xs text-neutral-400">{helper}</p>}
    </div>
  );
}

function EmptyText({ children }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
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
  const [certifications, setCertifications] = useState([]);
  const [eventCertifications, setEventCertifications] = useState([]);
  const [salonRating, setSalonRating] = useState(null);
  const [salonReviewsCount, setSalonReviewsCount] = useState(0);
  const [servicesCount, setServicesCount] = useState(null);
  const [portfolioCount, setPortfolioCount] = useState(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

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
    profession: savedProfile?.profession || currentUser?.profession || "barber",
    barberType: savedProfile?.barberType || currentUser?.barberType || "",
    specialty: savedProfile?.specialty || currentUser?.specialty || "unisex",
    imageUrl: savedProfile?.imageUrl || currentUser?.avatarUrl || "",
    galleryImages: savedProfile?.galleryImages || [],
    defaultSchedule: savedProfile?.defaultSchedule || defaultPersonalSchedule,
    salon: savedProfile?.salon || null,
    salonStatus: savedProfile?.salonStatus || currentUser?.salonStatus || "none",
    workHistory: savedProfile?.workHistory || currentUser?.workHistory || [],
    approvedSalons: savedProfile?.approvedSalons || savedProfile?.salons || [],
    primarySalon: savedProfile?.primarySalon || null,
    salons: savedProfile?.salons || [],
  });
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
            profession: data.profession || "barber",
            barberType: data.barberType || "",
            specialty: data.specialty || "",
            imageUrl: data.imageUrl || "",
            galleryImages: data.galleryImages || [],
            defaultSchedule: data.defaultSchedule || defaultPersonalSchedule,
            salon: data.salon || null,
            salonStatus: data.salonStatus || "none",
            workHistory: data.workHistory || [],
            approvedSalons: data.approvedSalons || data.salons || [],
            primarySalon: data.primarySalon || null,
            salons: data.salons || [],
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
    setProfile(nextProfile);
    setSaved(true);
    setProfileError("");
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
      {/* Sticky page header */}
      <div className="sticky top-0 z-30 border-b border-purple-100/50 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-lg font-bold text-neutral-950">Profile</h1>
            <p className="text-xs text-neutral-500">{headline || "Manage your public profile"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-neutral-400 sm:inline">
              {saved ? "Saved" : ""}
            </span>
            <Button
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-sm hover:from-purple-700 hover:to-pink-600"
              onClick={() => setIsEditDrawerOpen(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit profile
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Stat cards row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Star}
            label="Rating"
            value={statRating}
            helper={barberReviews.length > 0 ? "Client average" : "Waiting for first review"}
          />
          <StatCard
            icon={BriefcaseBusiness}
            label="Reviews"
            value={statReviews}
          />
          <StatCard
            icon={Scissors}
            label="Services"
            value={statServices}
          />
          <StatCard
            icon={Image}
            label="Portfolio"
            value={statPortfolio}
          />
        </div>

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
              onUpdateField={updateField}
              onSaveProfile={saveProfile}
              onAvatarUploaded={handleAvatarUploaded}
            />

            {/* About */}
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
              <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
                <h2 className="font-bold text-white">About</h2>
              </div>
              <CardContent className="space-y-4 p-5">
                {profile.bio ? (
                  <p className="text-sm leading-6 text-neutral-600">{profile.bio}</p>
                ) : (
                  <EmptyText>No bio added yet.</EmptyText>
                )}
                <div className="grid gap-3 border-t border-neutral-100 pt-4 text-sm text-neutral-600 sm:grid-cols-2">
                  {profile.city && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-neutral-400" />
                      {profile.city}
                    </p>
                  )}
                  {profile.address && (
                    <p className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-neutral-400" />
                      {profile.address}
                    </p>
                  )}
                  {instagramHref && (
                    <a
                      className="flex items-center gap-2 font-medium text-neutral-800 hover:text-neutral-950"
                      href={instagramHref}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <AtSign className="h-4 w-4 text-neutral-400" />
                      {instagramHandle}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Portfolio / Gallery */}
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
              <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
                <h2 className="font-bold text-white">Portfolio</h2>
              </div>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-500">
                  {portfolioCount && portfolioCount > 0
                    ? `${portfolioCount} portfolio item${portfolioCount === 1 ? "" : "s"} ready for clients.`
                    : "No portfolio items yet."}
                </p>
                <Button as={Link} to="/admin/portfolio" variant="outline">
                  <Camera className="mr-2 h-4 w-4" />
                  Manage portfolio
                </Button>
              </CardContent>
            </Card>

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

        {/* Salon & work card at bottom */}
        <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
            <h2 className="font-bold text-white">Salon & work</h2>
          </div>
          <CardContent className="p-5">
            {showSalonLink ? (
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <Link
                  className="font-semibold text-purple-700 hover:text-purple-900"
                  to={`/salons/${salonId}`}
                >
                  {salonName}
                </Link>
                {salonRating !== null && (
                  <p className="mt-1 text-sm text-purple-500">
                    <Star className="mr-0.5 inline-block h-3 w-3 fill-amber-400 text-amber-500" />
                    {salonRating ? salonRating.toFixed(1) : "0.0"} ·{" "}
                    {salonReviewsCount} {salonReviewsCount === 1 ? "review" : "reviews"}
                  </p>
                )}
              </div>
            ) : (
              <EmptyText>No salon connected yet.</EmptyText>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drawer for full edit mode */}
      <Drawer
        description="Update the details clients see before booking."
        isOpen={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
        title="Edit profile"
      >
        <ProfileFormCard
          profile={profile}
          isProfileSaving={isProfileSaving}
          saved={saved}
          profileError={profileError}
          currentUser={currentUser}
          onUpdateField={updateField}
          onSaveProfile={saveProfile}
          onAvatarUploaded={handleAvatarUploaded}
        />

        <Card className="rounded-2xl">
          <CardContent className="space-y-5 p-4">
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
              className="w-full"
              disabled={!hasEmailChanges || isEmailSaving}
              variant="outline"
              onClick={saveEmail}
            >
              {isEmailSaving ? "Saving..." : "Save email"}
            </Button>
          </CardContent>
        </Card>
      </Drawer>
    </div>
  );
}
