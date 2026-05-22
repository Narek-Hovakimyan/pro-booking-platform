import AvatarUploadButton from "@/shared/components/AvatarUploadButton";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function ProfileFormCard({
  profile,
  isProfileSaving,
  saved,
  profileError,
  galleryUrl,
  galleryImages,
  currentUser,
  onUpdateField,
  onSaveProfile,
  onAvatarUploaded,
  onGalleryUrlChange,
  onAddGalleryImage,
  onRemoveGalleryImage,
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

          <label className="grid gap-2 text-sm font-semibold">
            Bio
            <textarea
              className="w-full rounded-2xl border p-3 font-normal"
              disabled={isProfileSaving}
              placeholder="Bio"
              value={profile.bio}
              onChange={(event) => onUpdateField("bio", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Specialty / Մասնագիտացում
            <select
              className="w-full rounded-2xl border p-3 font-normal"
              disabled={isProfileSaving}
              value={profile.specialty || "unisex"}
              onChange={(event) => onUpdateField("specialty", event.target.value)}
            >
              <option value="men">Men's barber (Տղամարդու վարսահարդար)</option>
              <option value="women">Women's hairdresser (Կանացի վարսահարդար)</option>
              <option value="unisex">Unisex / Both (Ունիվերսալ)</option>
            </select>
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

            <label className="grid gap-2 text-sm font-semibold">
              Avatar URL
              <input
                className="w-full rounded-2xl border p-3 font-normal"
                disabled={isProfileSaving}
                placeholder="Avatar URL"
                value={profile.imageUrl}
                onChange={(event) => onUpdateField("imageUrl", event.target.value)}
              />
            </label>
          </div>

          <AvatarUploadButton
            disabled={isProfileSaving}
            label={profile.imageUrl ? "Change image" : "Add image"}
            uploadUrl={`/barbers/profile/${currentUser.id}`}
            onUploaded={onAvatarUploaded}
          />

          <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-lg font-bold">Gallery</h2>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-2 text-sm font-semibold">
                Work image URL
                <input
                  className="w-full rounded-2xl border p-3 font-normal"
                  disabled={isProfileSaving}
                  placeholder="Work image URL"
                  value={galleryUrl}
                  onChange={(event) => onGalleryUrlChange(event.target.value)}
                />
              </label>
              <Button
                className="self-end"
                disabled={isProfileSaving}
                type="button"
                variant="outline"
                onClick={onAddGalleryImage}
              >
                Add image
              </Button>
            </div>

            {galleryImages.length === 0 ? (
              <p className="text-sm text-neutral-500">No gallery images yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {galleryImages.map((imageUrl) => (
                  <div className="overflow-hidden rounded-2xl border" key={imageUrl}>
                    <img
                      alt="Gallery work"
                      className="aspect-[4/3] w-full object-cover"
                      src={getMediaUrl(imageUrl)}
                    />
                    <div className="p-2">
                      <Button
                        className="w-full"
                        disabled={isProfileSaving}
                        type="button"
                        variant="outline"
                        onClick={() => onRemoveGalleryImage(imageUrl)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
