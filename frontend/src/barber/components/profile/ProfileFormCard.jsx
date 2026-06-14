import AvatarUploadButton from "@/shared/components/AvatarUploadButton";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function ProfileFormCard({
  profile,
  isProfileSaving,
  saved,
  profileError,
  currentUser,
  onUpdateField,
  onSaveProfile,
  onAvatarUploaded,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
          <p className="mt-2 text-neutral-500">
            Update the information clients see before booking.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSaveProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Name
              <input
                className="w-full rounded-2xl border p-3 font-normal"
                disabled={isProfileSaving}
                placeholder="Name"
                value={profile.name}
                onChange={(event) => onUpdateField("name", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Phone
              <input
                className="w-full rounded-2xl border p-3 font-normal"
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
                className="w-full rounded-2xl border p-3 font-normal"
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
                  className="w-full rounded-2xl border p-3 font-normal"
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

          <label className="grid gap-2 text-sm font-semibold">
            Bio
            <textarea
              className="min-h-28 w-full rounded-2xl border p-3 font-normal"
              disabled={isProfileSaving}
              placeholder="Short introduction for clients"
              value={profile.bio}
              onChange={(event) => onUpdateField("bio", event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              City
              <input
                className="w-full rounded-2xl border p-3 font-normal"
                disabled={isProfileSaving}
                placeholder="City"
                value={profile.city}
                onChange={(event) => onUpdateField("city", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Address
              <input
                className="w-full rounded-2xl border p-3 font-normal"
                disabled={isProfileSaving}
                placeholder="Address"
                value={profile.address}
                onChange={(event) => onUpdateField("address", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Instagram
              <input
                className="w-full rounded-2xl border p-3 font-normal"
                disabled={isProfileSaving}
                placeholder="Instagram"
                value={profile.instagram}
                onChange={(event) => onUpdateField("instagram", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-[112px_1fr] sm:items-center">
            {profile.imageUrl ? (
              <img
                alt={profile.name || "Profile photo"}
                className="aspect-square w-28 rounded-2xl object-cover"
                src={getMediaUrl(profile.imageUrl)}
              />
            ) : (
              <div className="flex aspect-square w-28 items-center justify-center rounded-2xl bg-white text-sm text-neutral-400">
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

          <Button
            className="w-full sm:w-auto"
            disabled={isProfileSaving}
            type="submit"
          >
            {isProfileSaving ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
