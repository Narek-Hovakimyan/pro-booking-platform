import { useEffect, useRef, useState } from "react";

import { updateSalonJoinApplicationPolicy } from "@/shared/api/salonMembership";
import { Button } from "@/shared/components/ui/button";

const POLICIES = new Set(["closed", "job_only", "open"]);

const normalizePolicy = (value) =>
  typeof value === "string" && POLICIES.has(value) ? value : "open";

const options = [
  { value: "closed", label: "Off", description: "Do not accept salon applications." },
  { value: "job_only", label: "Only through job posts", description: "Direct join requests are unavailable." },
  { value: "open", label: "Anyone looking to join", description: "Allow direct join requests." },
];

function SalonPolicyControl({ salon, showName }) {
  const salonId = salon?.id || salon?._id;
  const propPolicy = normalizePolicy(salon?.joinApplicationPolicy);
  const [draft, setDraft] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const savingRef = useRef(false);
  const latestPropPolicyRef = useRef(propPolicy);

  useEffect(() => {
    latestPropPolicyRef.current = propPolicy;
  }, [propPolicy]);

  if (!salonId) return null;

  const hasCurrentDraft = draft?.salonId === salonId;
  const hasCurrentConfirmation =
    confirmed?.salonId === salonId && confirmed.sourcePolicy === propPolicy;
  const authoritativePolicy = hasCurrentConfirmation ? confirmed.policy : propPolicy;
  const draftIsCurrent = hasCurrentDraft && (isSaving || draft.sourcePolicy === propPolicy);
  const displayedPolicy = draftIsCurrent ? draft.policy : authoritativePolicy;

  const save = async () => {
    if (savingRef.current || displayedPolicy === authoritativePolicy) return;
    const policyToSave = displayedPolicy;
    savingRef.current = true;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await updateSalonJoinApplicationPolicy(salonId, policyToSave);
      const policy = normalizePolicy(response?.data?.joinApplicationPolicy);
      setConfirmed({ salonId, sourcePolicy: latestPropPolicyRef.current, policy });
      setDraft(null);
      setSuccess("Application settings saved.");
    } catch (requestError) {
      setDraft(null);
      const message = requestError?.response?.data?.message;
      setError(typeof message === "string" && message.trim() ? message : "Could not save application settings.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      {showName && <h3 className="font-semibold text-neutral-900">{salon.name || "Salon"}</h3>}
      <fieldset className="mt-2 space-y-2" disabled={isSaving}>
        <legend className="text-sm font-semibold text-neutral-900">Accept applications</legend>
        {options.map((option) => (
          <label className="flex cursor-pointer gap-2 rounded-xl p-2 hover:bg-neutral-50" key={option.value}>
            <input
              checked={displayedPolicy === option.value}
              name={`join-application-policy-${salonId}`}
              onChange={() => setDraft({ salonId, sourcePolicy: propPolicy, policy: option.value })}
              type="radio"
              value={option.value}
            />
            <span className="text-sm text-neutral-700">
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-neutral-500">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-700">{success}</p>}
      <Button className="mt-3" disabled={isSaving || displayedPolicy === authoritativePolicy} onClick={save} size="sm">
        {isSaving ? "Saving..." : "Save application settings"}
      </Button>
    </section>
  );
}

export default function SalonApplicationPolicySettings({ salons = [] }) {
  const managedSalons = Array.isArray(salons) ? salons.filter(Boolean) : [];
  if (managedSalons.length === 0) return null;

  return (
    <div className="space-y-3">
      {managedSalons.map((salon) => (
        <SalonPolicyControl
          key={salon.id || salon._id}
          salon={salon}
          showName={managedSalons.length > 1}
        />
      ))}
    </div>
  );
}
