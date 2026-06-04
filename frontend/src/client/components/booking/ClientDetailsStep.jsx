import { useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, ImagePlus, X, Gift, LoaderCircle, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const MAX_REFERENCE_FILES = 5;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const HAIR_TYPE_OPTIONS = [
  { value: "straight", label: "Straight" },
  { value: "wavy", label: "Wavy" },
  { value: "curly", label: "Curly" },
  { value: "coily", label: "Coily" },
  { value: "fine", label: "Fine/Thin" },
  { value: "thick", label: "Thick" },
  { value: "oily", label: "Oily scalp" },
  { value: "dry", label: "Dry" },
  { value: "damaged", label: "Damaged" },
  { value: "colored", label: "Colored/Treated" },
  { value: "other", label: "Other" },
];

const CONSENT_TEXT_VERSION = "v1.0";

const initialConsultationState = {
  hairType: "",
  chemicalTreatments: "",
  allergies: "",
  scalpSensitivity: "",
  desiredOutcome: "",
  notes: "",
};

export default function ClientDetailsStep({
  client = { name: "", phone: "", note: "" },
  onChange,
  onBack,
  onContinue,
  canConfirm = false,
  error = "",
  rebookSummary = null,
  referenceFiles = [],
  onReferenceFilesChange,
  consultation = null,
  onConsultationChange,
  onConsentChange,
  /* ── Voucher props ── */
  publicVouchers = [],
  voucherCode = "",
  voucherPreview = null,
  discountPreview = 0,
  voucherError = "",
  voucherLoading = false,
  onVoucherCodeChange,
  onApplyVoucher,
  onRemoveVoucher,
}) {
  const [showConsultation, setShowConsultation] = useState(false);
  const [localConsultation, setLocalConsultation] = useState(
    consultation || { ...initialConsultationState }
  );
  const [consentGiven, setConsentGiven] = useState(false);
  const [fileError, setFileError] = useState("");

  const previewUrls = useMemo(
    () => referenceFiles.map((file) => URL.createObjectURL(file)),
    [referenceFiles]
  );

  useEffect(
    () => () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    },
    [previewUrls]
  );

  const handleChange = (field, value) => {
    onChange?.({ ...client, [field]: value });
  };

  const handleFileSelect = (e) => {
    if (!onReferenceFilesChange) return;

    const selectedFiles = Array.from(e.target.files || []);
    const currentCount = referenceFiles.length;
    const maxNewCount = MAX_REFERENCE_FILES - currentCount;

    if (selectedFiles.length > maxNewCount) {
      setFileError(`You can add up to ${maxNewCount} more file(s).`);
      e.target.value = "";
      return;
    }

    const validFiles = [];
    for (const file of selectedFiles) {
      if (!ALLOWED_TYPES.has(file.type)) {
        setFileError(
          `${file.name} is not a supported image type. Use JPEG, PNG, or WEBP.`
        );
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    onReferenceFilesChange([...referenceFiles, ...validFiles]);
    setFileError("");
    e.target.value = "";
  };

  const removeFile = (index) => {
    if (!onReferenceFilesChange) return;
    const updated = referenceFiles.filter((_, i) => i !== index);
    onReferenceFilesChange(updated);
  };

  const handleConsultationField = useCallback((field, value) => {
    setLocalConsultation((prev) => {
      const updated = { ...prev, [field]: value };
      return updated;
    });
  }, []);

  const applyConsultation = useCallback(() => {
    if (
      !localConsultation.hairType &&
      !localConsultation.chemicalTreatments &&
      !localConsultation.allergies &&
      !localConsultation.scalpSensitivity &&
      !localConsultation.desiredOutcome &&
      !localConsultation.notes
    ) {
      onConsultationChange(null);
      return;
    }
    onConsultationChange(localConsultation);
  }, [localConsultation, onConsultationChange]);

  const handleConsentToggle = useCallback(() => {
    const newConsentGiven = !consentGiven;
    setConsentGiven(newConsentGiven);
    if (newConsentGiven) {
      onConsentChange({ accepted: true, textVersion: CONSENT_TEXT_VERSION });
    } else {
      onConsentChange(null);
    }
  }, [consentGiven, onConsentChange]);

  const toggleConsultation = useCallback(() => {
    const newShow = !showConsultation;
    setShowConsultation(newShow);
    if (!newShow) {
      onConsultationChange(null);
    } else {
      applyConsultation();
    }
  }, [showConsultation, onConsultationChange, applyConsultation]);

  /* ── Voucher input state ── */
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [localCode, setLocalCode] = useState(voucherCode || "");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">
          {`Լրացրու տվյալները`}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Confirm your contact details for this booking.
        </p>
      </div>

      {rebookSummary}

      <label className="grid gap-1.5 text-sm font-semibold">
        <span>
          Name <span className="text-red-500">*</span>
        </span>
        <input
          className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
          placeholder="Your name"
          value={client.name}
          onChange={(e) => handleChange("name", e.target.value)}
        />
      </label>

      <label className="grid gap-1.5 text-sm font-semibold">
        <span>
          Phone <span className="text-red-500">*</span>
        </span>
        <input
          className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
          placeholder="+374 XX XXX XXX"
          value={client.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
        />
        <p className="text-xs font-normal text-neutral-400">
          We'll use this to confirm your appointment.
        </p>
      </label>

      <label className="grid gap-1.5 text-sm font-semibold">
        <span className="text-neutral-600">Note (optional)</span>
        <textarea
          className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
          placeholder="Any special requests..."
          rows={3}
          value={client.note}
          onChange={(e) => handleChange("note", e.target.value)}
        />
      </label>

      {/* ── Voucher section ── */}
      <div className="rounded-2xl border border-amber-100 bg-white">
        <button
          type="button"
          onClick={() => setShowVoucherInput(!showVoucherInput)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div>
            <span className="font-semibold text-amber-700">
              <Gift className="-mt-0.5 mr-1.5 inline-block h-4 w-4" />
              Promo Code
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">
              Promo codes apply after any service discount
            </p>
          </div>
          <svg
            className={`h-5 w-5 text-amber-400 transition-transform ${
              showVoucherInput ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showVoucherInput && (
          <div className="border-t border-amber-100 px-4 pb-4 pt-3">
            {!voucherPreview ? (
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-2xl border border-neutral-300 p-3 font-normal uppercase placeholder:normal-case transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  placeholder="Enter code"
                  disabled={voucherLoading}
                  maxLength={20}
                  value={localCode}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setLocalCode(val);
                    if (voucherCode && val !== voucherCode) {
                      onVoucherCodeChange?.();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && localCode.trim()) {
                      onApplyVoucher?.(localCode.trim());
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={voucherLoading || !localCode.trim()}
                  onClick={() => onApplyVoucher?.(localCode.trim())}
                  className="inline-flex h-12 w-24 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-amber-600 px-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {voucherLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4" />
                  )}
                  Apply
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800">
                        {voucherPreview.title || "Promo code applied"}
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-700">
                        Code: {voucherPreview.code}
                        {discountPreview > 0 && (
                          <span className="ml-2 font-semibold">
                            Promo -{Number(discountPreview).toLocaleString()} դր
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={voucherLoading}
                    onClick={() => onRemoveVoucher?.()}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {voucherError && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {voucherError}
              </p>
            )}

            {!voucherPreview && publicVouchers.length > 0 && !localCode.trim() && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">
                  Available promo codes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {publicVouchers.map((pv, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={voucherLoading}
                      onClick={() => {
                        setLocalCode(pv.code);
                        onApplyVoucher?.(pv.code);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                    >
                      <Tag className="h-3 w-3" />
                      {pv.code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hair Consultation Section */}
      <div className="rounded-2xl border border-violet-100 bg-white">
        <button
          type="button"
          onClick={toggleConsultation}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div>
            <span className="font-semibold text-violet-700">
              Hair Consultation (optional)
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">
              Help the specialist prepare for your appointment
            </p>
          </div>
          <svg
            className={`h-5 w-5 text-violet-400 transition-transform ${
              showConsultation ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showConsultation && (
          <div className="space-y-3 border-t border-violet-100 px-4 pb-4 pt-3">
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Hair type</span>
              <select
                className="w-full rounded-2xl border p-3 font-normal text-neutral-700"
                value={localConsultation.hairType}
                onChange={(e) =>
                  handleConsultationField("hairType", e.target.value)
                }
              >
                <option value="">Select hair type...</option>
                {HAIR_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Chemical treatments</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="e.g., bleach, color, perm, relaxer..."
                rows={2}
                value={localConsultation.chemicalTreatments}
                onChange={(e) =>
                  handleConsultationField("chemicalTreatments", e.target.value)
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Allergies</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="e.g., sulfates, parabens, latex..."
                rows={2}
                value={localConsultation.allergies}
                onChange={(e) =>
                  handleConsultationField("allergies", e.target.value)
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Scalp sensitivity</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="e.g., mild, sensitive, itchy, flaky..."
                rows={2}
                value={localConsultation.scalpSensitivity}
                onChange={(e) =>
                  handleConsultationField("scalpSensitivity", e.target.value)
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Desired outcome</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="Describe the result you want..."
                rows={2}
                value={localConsultation.desiredOutcome}
                onChange={(e) =>
                  handleConsultationField("desiredOutcome", e.target.value)
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Additional notes</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="Anything else the specialist should know..."
                rows={2}
                value={localConsultation.notes}
                onChange={(e) =>
                  handleConsultationField("notes", e.target.value)
                }
              />
            </label>

            <Button
              className="w-full sm:w-auto"
              size="sm"
              onClick={applyConsultation}
            >
              Save consultation details
            </Button>

            {consultation && (
              <p className="text-xs text-emerald-600">
                {`\u2713`} Consultation details saved
              </p>
            )}
          </div>
        )}
      </div>

      {/* Photo Consent Section */}
      <div className="rounded-2xl border border-emerald-100 bg-white p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={handleConsentToggle}
            className="mt-0.5 h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
          />
          <div>
            <span className="font-semibold text-emerald-700">
              Allow before/after photos
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">
              I agree that photos of my hair may be used for the
              specialist's before/after portfolio. I understand photos will
              only be shared publicly with my explicit consent.
            </p>
            {consentGiven && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Consent given — thank you
              </p>
            )}
          </div>
        </label>
      </div>

      {onReferenceFilesChange && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-600">
              Reference Photos (optional)
            </span>
            <span className="text-xs text-neutral-400">
              {referenceFiles.length}/{MAX_REFERENCE_FILES}
            </span>
          </div>

          {/* Preview thumbnails */}
          {referenceFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {referenceFiles.map((file, index) => (
                <div
                  key={index}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border"
                >
                  <img
                    src={previewUrls[index]}
                    alt={`Reference ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label={`Remove reference image ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add button */}
          {referenceFiles.length < MAX_REFERENCE_FILES && (
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700">
              <ImagePlus className="h-5 w-5" />
              <span>Add reference photos</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          )}

          <p className="text-xs text-neutral-400">
            JPEG, PNG, or WEBP. Max {MAX_FILE_SIZE_MB}MB each. Up to{" "}
            {MAX_REFERENCE_FILES} images.
          </p>

          {fileError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {fileError}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:flex sm:items-center">
        <Button className="w-full sm:w-auto" variant="outline" onClick={onBack}>
          Հետ
        </Button>

        {error && (
          <p className="order-first sm:order-none rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button
          className="w-full sm:w-auto"
          disabled={!canConfirm}
          onClick={onContinue}
        >
          Հաստատել ամրագրումը
        </Button>
      </div>
    </div>
  );
}
