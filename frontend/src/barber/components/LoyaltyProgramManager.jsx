import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/shared/api/axios";
import { Plus, Save, Trash2 } from "lucide-react";

export default function LoyaltyProgramManager() {
  const { currentUser } = useSelector((state) => state.auth);
  const canManageLoyalty = Boolean(currentUser?.id && currentUser?.role === "barber");
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    requiredVisits: 5,
    rewardText: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canManageLoyalty) {
      return;
    }

    let mounted = true;

    api.get("/api/loyalty/programs/me")
      .then(({ data }) => {
        if (mounted) setPrograms(data);
      })
      .catch(() => {
        if (mounted) setError("Could not load loyalty programs");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [canManageLoyalty]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const { data } = await api.post("/api/loyalty/programs", form);
      setPrograms((prev) => [data, ...prev]);
      setShowForm(false);
      setForm({ title: "", requiredVisits: 5, rewardText: "" });
    } catch (err) {
      setError(err.response?.data?.message || "Could not create program");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (programId) => {
    try {
      await api.delete(`/api/loyalty/programs/${programId}`);
      setPrograms((prev) =>
        prev.map((p) =>
          String(p._id) === String(programId) ? { ...p, active: false } : p
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not deactivate program");
    }
  };

  if (!canManageLoyalty || loading) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800">Loyalty Program</h3>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-600"
          onClick={() => setShowForm((v) => !v)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          New Program
        </button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-xl border border-pink-100 bg-pink-50 p-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Title</label>
            <input
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              maxLength={120}
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Required Visits</label>
            <input
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              max={100}
              min={1}
              required
              type="number"
              value={form.requiredVisits}
              onChange={(e) =>
                setForm((f) => ({ ...f, requiredVisits: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Reward Text</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              maxLength={300}
              required
              rows={2}
              value={form.rewardText}
              onChange={(e) => setForm((f) => ({ ...f, rewardText: e.target.value }))}
            />
          </div>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Create Program"}
          </button>
        </form>
      )}

      {programs.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">No loyalty programs created yet.</p>
      )}

      <div className="space-y-2">
        {programs.map((program) => (
          <div
            key={String(program._id)}
            className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
              program.active
                ? "border-pink-200 bg-white"
                : "border-neutral-200 bg-neutral-50 opacity-60"
            }`}
          >
            <div>
              <p className="font-medium text-neutral-800">
                {program.title}
                {!program.active && (
                  <span className="ml-2 text-xs text-neutral-400">(inactive)</span>
                )}
              </p>
              <p className="text-neutral-500">
                {program.requiredVisits} visits → {program.rewardText}
              </p>
            </div>
            {program.active && (
              <button
                className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                onClick={() => handleDeactivate(program._id)}
                title="Deactivate program"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
