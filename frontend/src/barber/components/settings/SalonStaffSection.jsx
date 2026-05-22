import { useEffect, useState } from "react";

import api from "@/shared/api/axios";
import SettingsCard from "@/barber/components/settings/SettingsCard";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import { getMediaUrl } from "@/shared/utils/media";

function StaffCard({ person }) {
  const avatarSrc =
    person.imageUrl || person.avatarUrl
      ? getMediaUrl(person.imageUrl || person.avatarUrl)
      : null;

  const roleBadge = () => {
    if (person.roleInSalon === "owner") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Owner
        </span>
      );
    }
    if (person.roleInSalon === "admin") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
          Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
        Staff
      </span>
    );
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white p-3">
      {avatarSrc ? (
        <img
          alt={person.name}
          className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          src={avatarSrc}
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-500">
          {person.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-neutral-900">
            {person.name}
          </span>
          {roleBadge()}
        </div>
        {(() => {
          const display = getSpecialistProfessionDisplay(person);
          if (!display) return null;
          return (
            <p className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${display.className}`}>
              {display.icon} {display.label}
            </p>
          );
        })()}
        {person.city && (
          <p className="text-xs text-neutral-400">{person.city}</p>
        )}
        {person.bio && (
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
            {person.bio}
          </p>
        )}
      </div>
    </div>
  );
}

function SalonSelector({ approvedSalons, selectedSalonId, onSelect }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-neutral-700">
        Select salon
      </label>
      <select
        className="w-full rounded-2xl border bg-white p-3 font-normal"
        value={selectedSalonId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {approvedSalons.map((entry) => {
          const salonId = entry.id || entry._id;
          const salonName = entry.name || "Salon";
          return (
            <option key={salonId} value={salonId}>
              {salonName}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function getEntryId(entry) {
  return entry?.id || entry?._id || "";
}

function getFirstSalonId(entries) {
  return entries.length > 0 ? getEntryId(entries[0]) : "";
}

export default function SalonStaffSection({ approvedSalonEntries }) {
  // Track user-initiated salon selection via the dropdown
  const [manuallySelectedId, setManuallySelectedId] = useState(null);

  // Derive the effective selection: user's choice, or the first approved salon.
  // When approvedSalonEntries arrives async ([] → populated), this automatically
  // picks the first salon without any effect-based state update.
  const firstSalonId = getFirstSalonId(approvedSalonEntries);
  const selectedSalonId = manuallySelectedId || firstSalonId;

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch staff when selectedSalonId changes
  useEffect(() => {
    if (!selectedSalonId) {
      return;
    }

    let isMounted = true;

    async function fetchStaff() {
      setLoading(true);
      setError("");

      try {
        const { data } = await api.get(`/salons/${selectedSalonId}/staff`);
        if (isMounted) {
          setStaff(data || []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salon staff."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchStaff();

    return () => {
      isMounted = false;
    };
  }, [selectedSalonId]);

  if (approvedSalonEntries.length === 0) return null;

  return (
    <SettingsCard
      title="Salon staff"
      description="View your coworkers at each salon."
    >
      {approvedSalonEntries.length > 1 && (
        <SalonSelector
          approvedSalons={approvedSalonEntries}
          selectedSalonId={selectedSalonId}
          onSelect={setManuallySelectedId}
        />
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading staff...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-neutral-500">No staff found.</p>
      ) : (
        <div className="space-y-2">
          {staff.map((person) => (
            <StaffCard key={person.id || person._id} person={person} />
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
