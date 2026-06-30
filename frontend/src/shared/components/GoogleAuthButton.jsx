import { useState } from "react";
import { useDispatch } from "react-redux";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/shared/api/axios";
import { loginUser } from "@/store/slices/authSlice";
import { Button } from "@/shared/components/ui/button";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const googleAvailable = Boolean(GOOGLE_CLIENT_ID);
const getPostGoogleRegistrationPath = (userRole, redirectPath) => {
  if (redirectPath) return redirectPath;
  return userRole === "barber" ? "/admin/settings/salon" : "/";
};

function ProfileCompletionModal({ credential, onComplete, onCancel, onCredentialError }) {
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!role || !phone.trim()) {
      setError("Role and phone are required.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/google", {
        credential,
        role,
        phone: phone.trim(),
      });
      onComplete(data);
    } catch (err) {
      const msg = err.response?.data?.message || "";
      if (msg.includes("credential") || msg.includes("token")) {
        onCredentialError("Session expired. Please try Google Sign-In again.");
      } else {
        setError(msg || "Could not complete profile. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold">Complete your profile</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Choose role and provide phone to finish creating your account.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-semibold" htmlFor="comp-role">
              Role
            </label>
            <select
              id="comp-role"
              className="w-full rounded-2xl border p-3"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select role</option>
              <option value="client">Client</option>
              <option value="barber">Barber</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-semibold" htmlFor="comp-phone">
              Phone
            </label>
            <input
              id="comp-phone"
              className="w-full rounded-2xl border p-3"
              placeholder="Phone number"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              className="w-full"
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GoogleAuthButton() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [completionCredential, setCompletionCredential] = useState(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  if (!googleAvailable) return null;

  const handleGoogleSuccess = async (credentialResponse) => {
    setError("");
    const credential = credentialResponse.credential;
    if (!credential) {
      setError("Google Sign-In did not return a credential. Please try again.");
      return;
    }

    setIsGoogleLoading(true);
    try {
      const { data } = await api.post("/auth/google", { credential });

      if (data.requiresProfileCompletion) {
        setCompletionCredential(credential);
        return;
      }

      dispatch(loginUser(data));
      const redirectPath = searchParams.get("redirect") || "";
      navigate(redirectPath || (data.user.role === "barber" ? "/admin" : "/"));
    } catch (err) {
      const message = err.response?.data?.message || "";
      setError(message || "Google Sign-In failed. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleComplete = (data) => {
    setCompletionCredential(null);
    setError("");
    dispatch(loginUser(data));
    const redirectPath = searchParams.get("redirect") || "";
    navigate(getPostGoogleRegistrationPath(data.user.role, redirectPath));
  };

  const handleCancel = () => {
    setCompletionCredential(null);
    setError("");
  };

  const handleCredentialError = (message) => {
    setCompletionCredential(null);
    setError(message || "Google Sign-In failed. Please try again.");
  };

  return (
    <>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-neutral-500">{t("auth.or")}</span>
        </div>
      </div>

      {isGoogleLoading ? (
        <Button className="w-full" disabled>
          Continuing...
        </Button>
      ) : (
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google Sign-In failed. Please try again.")}
          theme="outline"
          size="large"
          shape="pill"
          text="continue_with"
          width="100%"
        />
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {completionCredential && (
        <ProfileCompletionModal
          credential={completionCredential}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onCredentialError={handleCredentialError}
        />
      )}
    </>
  );
}
