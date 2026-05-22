import { Button } from "@/shared/components/ui/button";
import AvatarUploadButton from "@/shared/components/AvatarUploadButton";
import { getMediaUrl } from "@/shared/utils/media";

export default function ProfileBasicsForm({
  profile,
  isSaving,
  saved,
  error,
  currentUser,
  onSubmit,
  onChange,
  onAvatarUploaded,
}) {
  return (
    <form
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">
          Public profile
        </h3>
        <p className="text-sm text-neutral-500">
          These details are shown to clients before booking.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Name
          <input
            className="w-full rounded-2xl border p-3 font-normal"
            disabled={isSaving}
            placeholder="Name"
            value={profile.name}
            onChange={(event) =>
              onChange("name", event.target.value)
            }
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          City
          <input
            className="w-full rounded-2xl border p-3 font-normal"
            disabled={isSaving}
            placeholder="City"
            value={profile.city}
            onChange={(event) =>
              onChange("city", event.target.value)
            }
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Phone
          <input
            className="w-full rounded-2xl border p-3 font-normal"
            disabled={isSaving}
            placeholder="Phone"
            value={profile.phone}
            onChange={(event) =>
              onChange("phone", event.target.value)
            }
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Avatar URL
          <input
            className="w-full rounded-2xl border p-3 font-normal"
            disabled={isSaving}
            placeholder="Avatar URL"
            value={profile.imageUrl}
            onChange={(event) =>
              onChange("imageUrl", event.target.value)
            }
          />
        </label>
      </div>

      <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-[140px_1fr] sm:items-center">
        {profile.imageUrl ? (
          <img
            alt={profile.name || "Profile avatar"}
            className="aspect-square w-full rounded-2xl object-cover"
            src={getMediaUrl(profile.imageUrl)}
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-white text-sm text-neutral-400">
            No image
          </div>
        )}

        <AvatarUploadButton
          disabled={isSaving}
          label={profile.imageUrl ? "Change image" : "Add image"}
          uploadUrl={`/barbers/profile/${currentUser.id}`}
          onUploaded={onAvatarUploaded}
        />
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        Specialty / Մասնագիտացում
        <select
          className="w-full rounded-2xl border p-3 font-normal"
          disabled={isSaving}
          value={profile.specialty || "unisex"}
          onChange={(event) =>
            onChange("specialty", event.target.value)
          }
        >
          <option value="men">Men's barber (Տղամարդու վարսահարդար)</option>
          <option value="women">Women's hairdresser (Կանացի վարսահարդար)</option>
          <option value="unisex">Unisex / Both (Ունիվերսալ)</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Bio
        <textarea
          className="min-h-28 w-full rounded-2xl border p-3 font-normal"
          disabled={isSaving}
          placeholder="Bio"
          value={profile.bio}
          onChange={(event) =>
            onChange("bio", event.target.value)
          }
        />
      </label>

      {saved && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Settings saved.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button
        className="w-full sm:w-auto"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving..." : "Save profile settings"}
      </Button>
    </form>
  );
}
