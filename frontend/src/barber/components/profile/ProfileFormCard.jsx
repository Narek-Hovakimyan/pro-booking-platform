import AvatarUploadButton from "@/shared/components/AvatarUploadButton";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

const professionLabels = {
  barber: "Barber / Վարսահարդար",
  hair_stylist: "Hair stylist / Սանրվածքների վարպետ",
  nail_master: "Nail master / Մատնահարդար",
  makeup_artist: "Makeup artist / Դիմահարդար",
  cosmetologist: "Cosmetologist / Կոսմետոլոգ",
  lash_brow: "Lash & Brow / Թարթիչ-Հոնքերի վարպետ",
  massage: "Massage therapist / Մասաժիստ",
  other: "Other / Այլ",
};

const barberTypeLabels = {
  men: "Men's barber (Տղամարդու վարսահարդար)",
  women: "Women's hairdresser (Կանացի վարսահարդար)",
  unisex: "Unisex / Both (Ունիվերսալ)",
};

function DisplayField({ label, value, className = "" }) {
  const displayValue = value?.trim?.() || value || "Not set";

  return (
    <div className={`rounded-2xl border border-neutral-100 bg-neutral-50 p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-neutral-900">
        {displayValue}
      </p>
    </div>
  );
}

export default function ProfileFormCard({
  profile,
  isProfileSaving,
  saved,
  profileError,
  currentUser,
  onUpdateField,
  onSaveProfile,
  onAvatarUploaded,
  editable = true,
  variant = "full",
}) {
  const isBasicsVariant = variant === "basics";
  const headerDescription = editable
    ? isBasicsVariant
      ? "Add the core details and private address used for onboarding readiness."
      : "Update the information clients see before booking."
    : "Review the information clients see before booking.";
  const professionLabel =
    professionLabels[profile.profession || "barber"] || professionLabels.barber;
  const barberTypeLabel =
    profile.profession === "barber"
      ? barberTypeLabels[profile.barberType || "unisex"] || "Not set"
      : "";

  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-5">
        <h1 className="text-xl font-bold text-white">Profile</h1>
        <p className="mt-1 text-sm text-purple-100">
          {headerDescription}
        </p>
      </div>

      <CardContent className="space-y-5 p-5">
        {!editable && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[112px_1fr] sm:items-center">
              {profile.imageUrl ? (
                <img
                  alt={profile.name || "Profile photo"}
                  className="aspect-square w-28 rounded-2xl object-cover ring-2 ring-purple-200"
                  src={getMediaUrl(profile.imageUrl)}
                />
              ) : (
                <div className="flex aspect-square w-28 items-center justify-center rounded-2xl bg-neutral-50 text-sm text-neutral-400 ring-2 ring-purple-100">
                  No photo
                </div>
              )}
              <div className="space-y-2">
                <DisplayField label="Name" value={profile.name} />
                <DisplayField label="Phone" value={profile.phone} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DisplayField label="Profession / Մասնագիտություն" value={professionLabel} />
              {profile.profession === "barber" && (
                <DisplayField label="Barber type / Վարսահարդարի տեսակ" value={barberTypeLabel} />
              )}
              <DisplayField label="City" value={profile.city} />
              <DisplayField label="Address" value={profile.address} />
              <DisplayField label="Instagram" value={profile.instagram} />
              <DisplayField label="Bio" value={profile.bio} className="sm:col-span-2" />
            </div>
          </div>
        )}

        {editable && (
        <form className="space-y-4" onSubmit={onSaveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Name
              <input
                className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                placeholder="Name"
                value={profile.name}
                onChange={(event) => onUpdateField("name", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Phone
              <input
                className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                placeholder="Phone"
                value={profile.phone}
                onChange={(event) => onUpdateField("phone", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Profession / Մասնագիտություն
              <select
                className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                value={profile.profession || "barber"}
                onChange={(event) => {
                  onUpdateField("profession", event.target.value);
                  if (event.target.value !== "barber") {
                    onUpdateField("barberType", "");
                  }
                }}
              >
                <option value="barber">Barber / Վարսահարդար</option>
                <option value="hair_stylist">Hair stylist / Սանրվածքների վարպետ</option>
                <option value="nail_master">Nail master / Մատնահարդար</option>
                <option value="makeup_artist">Makeup artist / Դիմահարդար</option>
                <option value="cosmetologist">Cosmetologist / Կոսմետոլոգ</option>
                <option value="lash_brow">Lash & Brow / Թարթիչ-Հոնքերի վարպետ</option>
                <option value="massage">Massage therapist / Մասաժիստ</option>
                <option value="other">Other / Այլ</option>
              </select>
            </label>

            {profile.profession === "barber" && (
              <label className="grid gap-2 text-sm font-semibold">
                Barber type / Վարսահարդարի տեսակ
                <select
                  className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                  disabled={isProfileSaving}
                  value={profile.barberType || "unisex"}
                  onChange={(event) => onUpdateField("barberType", event.target.value)}
                >
                  <option value="men">Men's barber (Տղամարդու վարսահարդար)</option>
                  <option value="women">Women's hairdresser (Կանացի վարսահարդար)</option>
                  <option value="unisex">Unisex / Both (Ունիվերսալ)</option>
                </select>
              </label>
            )}
          </div>

          {!isBasicsVariant && (
            <label className="grid gap-2 text-sm font-semibold">
              Bio
              <textarea
                className="min-h-28 w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                placeholder="Short introduction for clients"
                value={profile.bio}
                onChange={(event) => onUpdateField("bio", event.target.value)}
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              City
              <input
                className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                placeholder="City"
                value={profile.city}
                onChange={(event) => onUpdateField("city", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Address
              <input
                className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                disabled={isProfileSaving}
                placeholder={isBasicsVariant ? "Private address" : "Address"}
                value={profile.address}
                onChange={(event) => onUpdateField("address", event.target.value)}
              />
            </label>
          </div>

          {!isBasicsVariant && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Instagram
                <input
                  className="w-full rounded-2xl border p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                  disabled={isProfileSaving}
                  placeholder="Instagram"
                  value={profile.instagram}
                  onChange={(event) => onUpdateField("instagram", event.target.value)}
                />
              </label>
            </div>
          )}

          {/* Upload photo block */}
          {!isBasicsVariant && (
          <div className="grid gap-4 rounded-2xl border border-purple-100 bg-purple-50 p-4 sm:grid-cols-[112px_1fr] sm:items-center">
            {profile.imageUrl ? (
              <img
                alt={profile.name || "Profile photo"}
                className="aspect-square w-28 rounded-2xl object-cover ring-2 ring-purple-200"
                src={getMediaUrl(profile.imageUrl)}
              />
            ) : (
              <div className="flex aspect-square w-28 items-center justify-center rounded-2xl bg-white text-sm text-neutral-400 ring-2 ring-purple-200">
                No photo
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-900">
                Profile photo
              </p>
              <p className="text-sm text-neutral-500">
                Upload the image clients see on your public profile.
              </p>
              <AvatarUploadButton
                disabled={isProfileSaving}
                label={profile.imageUrl ? "Change photo" : "Upload photo"}
                uploadUrl={`/barbers/profile/${currentUser.id}`}
                onUploaded={onAvatarUploaded}
              />
            </div>
          </div>
          )}

          {saved && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Profile saved.
            </p>
          )}
          {profileError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {profileError}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md hover:from-purple-700 hover:to-pink-600 sm:w-auto"
              disabled={isProfileSaving}
              type="submit"
            >
              {isProfileSaving ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
