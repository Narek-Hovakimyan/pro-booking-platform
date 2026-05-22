import { Button } from "@/shared/components/ui/button";

export default function ClientDetailsStep({
  client = { name: "", phone: "", note: "" },
  onChange,
  onBack,
  onContinue,
  canConfirm = false,
  error = "",
  rebookSummary = null,
}) {
  const handleChange = (field, value) => {
    onChange?.({ ...client, [field]: value });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">Լրացրու տվյալները</h2>
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
