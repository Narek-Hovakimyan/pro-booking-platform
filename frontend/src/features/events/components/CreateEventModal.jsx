import { MapPin, X } from "lucide-react";

import { EVENT_TYPE_OPTIONS } from "@/features/events/utils/eventFormatters";
import { Button } from "@/shared/components/ui/button";

const getSalonId = (salon) => salon?._id || salon?.id || "";

export default function CreateEventModal({
  isOpen,
  onClose,
  eventForm,
  onFieldChange,
  validationErrors,
  manageableSalons,
  imagePreview,
  isSubmitting,
  onSubmit,
  onFileChange,
  onSalonSelect,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Create Event</h2>
          <button
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {validationErrors && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {validationErrors}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Title *
            </label>
            <input
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="Event title"
              value={eventForm.title}
              onChange={(e) => onFieldChange("title", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Description
            </label>
            <textarea
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="Event description"
              rows={3}
              value={eventForm.description}
              onChange={(e) => onFieldChange("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Event type
              </label>
              <select
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                value={eventForm.type}
                onChange={(e) => onFieldChange("type", e.target.value)}
              >
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Visibility
              </label>
              <select
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                value={eventForm.visibility}
                onChange={(e) => onFieldChange("visibility", e.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Instructor *
            </label>
            <input
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="Instructor name"
              value={eventForm.instructor}
              onChange={(e) => onFieldChange("instructor", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Instructor Bio
            </label>
            <textarea
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="About the instructor"
              rows={2}
              value={eventForm.instructorBio}
              onChange={(e) => onFieldChange("instructorBio", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Date *
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="date"
                value={eventForm.date}
                onChange={(e) => onFieldChange("date", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Time * (HH:mm)
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="text"
                placeholder="e.g., 09:30"
                maxLength={5}
                value={eventForm.time}
                onChange={(e) => {
                  let val = e.target.value;
                  val = val.replace(/[^0-9:]/g, "");
                  if (
                    val.length === 2 &&
                    !val.includes(":") &&
                    eventForm.time.length < 2
                  ) {
                    val += ":";
                  }
                  if (val.length > 5) val = val.slice(0, 5);
                  onFieldChange("time", val);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Duration (min) *
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="number"
                min="15"
                step="15"
                placeholder="120"
                value={eventForm.duration}
                onChange={(e) => onFieldChange("duration", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Price (AMD)
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                type="number"
                min="0"
                placeholder="0 = Free"
                value={eventForm.price}
                onChange={(e) => onFieldChange("price", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Max Participants
            </label>
            <input
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              type="number"
              min="1"
              placeholder="20"
              value={eventForm.maxParticipants}
              onChange={(e) => onFieldChange("maxParticipants", e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-700">
            <input
              checked={Boolean(eventForm.certificatesEnabled)}
              className="h-4 w-4"
              type="checkbox"
              onChange={(event) =>
                onFieldChange("certificatesEnabled", event.target.checked)
              }
            />
            <span>This event gives certificates</span>
          </label>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-neutral-400" />
              <label className="text-sm font-medium text-neutral-700">
                Location *
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                  eventForm.locationType === "salon"
                    ? "border-neutral-900 bg-neutral-900/5 text-neutral-900"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
                }`}
                onClick={() => {
                  const fallbackSalonId =
                    eventForm.salonId ||
                    (manageableSalons.length === 1
                      ? getSalonId(manageableSalons[0])
                      : "");

                  if (fallbackSalonId) {
                    onSalonSelect(fallbackSalonId);
                  } else {
                    onFieldChange("locationType", "salon");
                  }
                }}
              >
                <span className="text-lg">🏢</span>
                <span>At my salon</span>
              </button>
              <button
                type="button"
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                  eventForm.locationType === "other"
                    ? "border-neutral-900 bg-neutral-900/5 text-neutral-900"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
                }`}
                onClick={() => {
                  onFieldChange("locationType", "other");
                  onFieldChange("salonId", "");
                  onFieldChange("location", "");
                }}
              >
                <span className="text-lg">📍</span>
                <span>Other location</span>
              </button>
            </div>
          </div>

          {eventForm.locationType === "salon" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Salon *
              </label>
              <select
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                value={eventForm.salonId}
                onChange={(e) => onSalonSelect(e.target.value)}
              >
                <option value="">Select a salon</option>
                {manageableSalons.map((salon) => (
                  <option key={getSalonId(salon)} value={getSalonId(salon)}>
                    {salon.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {eventForm.locationType === "other" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Venue / Location *
              </label>
              <input
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="e.g., Marriott Hotel, Conference Hall A"
                value={eventForm.location}
                onChange={(e) => onFieldChange("location", e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Event image
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              type="file"
              onChange={onFileChange}
            />
            {imagePreview && (
              <img
                alt="Event preview"
                className="mt-3 h-40 w-full rounded-xl object-cover"
                src={imagePreview}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Image URL fallback
            </label>
            <input
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              placeholder="https://..."
              value={eventForm.imageUrl}
              onChange={(e) => onFieldChange("imageUrl", e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={isSubmitting} onClick={onSubmit}>
              {isSubmitting ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
