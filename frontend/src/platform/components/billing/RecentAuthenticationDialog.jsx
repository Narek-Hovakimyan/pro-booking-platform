import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";

import { confirmRecentAuthentication } from "@/shared/api/recentAuthentication";
import { Button } from "@/shared/components/ui/button";

export function RecentAuthenticationDialog({ isOpen, methods = [], onCancel, onConfirmed }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!currentPassword.trim() || isSubmitting) return;
    setSubmitting(true);
    setError("");
    try {
      await confirmRecentAuthentication({ currentPassword });
      await onConfirmed();
      setCurrentPassword("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Recent authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async ({ credential }) => {
    if (!credential || isSubmitting) return;
    setSubmitting(true);
    setError("");
    try {
      await confirmRecentAuthentication({ googleCredential: credential });
      await onConfirmed();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Google recent authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const canUseGoogle = methods.includes("google");
  const canUsePassword = methods.includes("password") || !canUseGoogle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div aria-modal="true" aria-labelledby="recent-auth-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog">
        <div>
          <h2 id="recent-auth-title" className="text-xl font-bold">Confirm your identity</h2>
          <p className="mt-1 text-sm text-neutral-600">Confirm your identity to continue this billing action.</p>
        </div>
        {canUsePassword && <label className="block text-sm font-medium text-neutral-700" htmlFor="recent-auth-password">
          Current password
          <input autoComplete="current-password" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2" disabled={isSubmitting} id="recent-auth-password" onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} />
        </label>}
        {canUseGoogle && <GoogleLogin onError={() => setError("Google recent authentication failed.")} onSuccess={handleGoogleCredential} text="continue_with" />}
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="outline">Cancel</Button>
          {canUsePassword && <Button disabled={isSubmitting || !currentPassword.trim()} onClick={handleConfirm} type="button">{isSubmitting ? "Confirming..." : "Continue"}</Button>}
        </div>
      </div>
    </div>
  );
}
