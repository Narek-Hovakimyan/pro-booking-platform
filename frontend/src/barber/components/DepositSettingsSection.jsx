import { useEffect, useState } from "react";
import api from "@/shared/api/axios";

export default function DepositSettingsSection() {
  const [depositSettings, setDepositSettings] = useState({
    enabled: false,
    mode: "percentage",
    value: 0,
    minimumBookingPrice: null,
    noShowPolicyText: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    api
      .get("/barbers/me/deposit-settings")
      .then(({ data }) => {
        if (!isMounted) return;
        setDepositSettings(data.depositSettings);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Could not load deposit settings");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const { data } = await api.patch("/barbers/me/deposit-settings", depositSettings);
      setDepositSettings(data.depositSettings);
      setSaved(true);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not save deposit settings"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">Loading deposit settings...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-neutral-900">
        Booking Deposit / No-show Protection
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        Deposit is optional. If enabled, clients will see the deposit requirement
        before confirming a booking.
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {saved && (
        <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Deposit settings saved.
        </p>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-5">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={depositSettings.enabled}
            onChange={(e) =>
              setDepositSettings((prev) => ({
                ...prev,
                enabled: e.target.checked,
              }))
            }
            className="h-5 w-5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
          />
          <span className="text-sm font-medium text-neutral-800">
            Require deposit for bookings
          </span>
        </label>

        {depositSettings.enabled && (
          <>
            {/* Mode selector */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Deposit mode
              </label>
              <div className="mt-2 flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depositMode"
                    value="percentage"
                    checked={depositSettings.mode === "percentage"}
                    onChange={() =>
                      setDepositSettings((prev) => ({
                        ...prev,
                        mode: "percentage",
                      }))
                    }
                    className="text-neutral-900 focus:ring-neutral-900"
                  />
                  <span className="text-sm text-neutral-700">Percentage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depositMode"
                    value="fixed"
                    checked={depositSettings.mode === "fixed"}
                    onChange={() =>
                      setDepositSettings((prev) => ({
                        ...prev,
                        mode: "fixed",
                      }))
                    }
                    className="text-neutral-900 focus:ring-neutral-900"
                  />
                  <span className="text-sm text-neutral-700">Fixed amount</span>
                </label>
              </div>
            </div>

            {/* Value */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                {depositSettings.mode === "percentage"
                  ? "Deposit percentage (%)"
                  : "Deposit amount (AMD)"}
              </label>
              <input
                type="number"
                min={0}
                max={depositSettings.mode === "percentage" ? 100 : undefined}
                value={depositSettings.value}
                onChange={(e) =>
                  setDepositSettings((prev) => ({
                    ...prev,
                    value: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
              />
              {depositSettings.mode === "percentage" && (
                <p className="mt-1 text-xs text-neutral-400">
                  Must be between 1 and 100
                </p>
              )}
            </div>

            {/* Minimum booking price */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Minimum booking price (AMD)
              </label>
              <input
                type="number"
                min={0}
                value={depositSettings.minimumBookingPrice || ""}
                onChange={(e) =>
                  setDepositSettings((prev) => ({
                    ...prev,
                    minimumBookingPrice: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
                placeholder="Optional"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Only apply deposit if booking price is at or above this amount
              </p>
            </div>

            {/* No-show policy text */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                No-show policy text
              </label>
              <textarea
                maxLength={1000}
                value={depositSettings.noShowPolicyText}
                onChange={(e) =>
                  setDepositSettings((prev) => ({
                    ...prev,
                    noShowPolicyText: e.target.value,
                  }))
                }
                rows={3}
                placeholder="e.g. Deposits are non-refundable for no-shows or late cancellations."
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {depositSettings.noShowPolicyText?.length || 0}/1000 characters
              </p>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
