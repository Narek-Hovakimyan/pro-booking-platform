import { useState, useCallback } from "react";
import api from "@/shared/api/axios";
import { updateCurrentUser } from "@/store/slices/authSlice";

/**
 * Hook for managing profile email/account state and API calls.
 */
export default function useProfileEmail({ currentUser, dispatch }) {
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [savedEmail, setSavedEmail] = useState(currentUser?.email ?? "");
  const [emailVerified, setEmailVerified] = useState(
    Boolean(currentUser?.emailVerified)
  );
  const [emailVerifiedAt, setEmailVerifiedAt] = useState(
    currentUser?.emailVerifiedAt ?? null
  );
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEmailSaving, setIsEmailSaving] = useState(false);

  const onEmailChange = useCallback((value) => {
    setEmail(value);
    setEmailMessage("");
    setEmailError("");
  }, []);

  const saveEmail = useCallback(async () => {
    setIsEmailSaving(true);
    setEmailError("");
    setEmailMessage("");

    try {
      const { data } = await api.put("/users/me", { email });
      const savedFromResponse = data.email ?? "";
      dispatch(updateCurrentUser(data));
      setEmail(savedFromResponse);
      setSavedEmail(savedFromResponse);
      setEmailVerified(Boolean(data.emailVerified));
      setEmailVerifiedAt(data.emailVerifiedAt ?? null);

      if (data.email && !data.emailVerified) {
        setEmailMessage("Verification email sent. Check your inbox.");
      } else if (data.email && data.emailVerified) {
        setEmailMessage("Email saved and verified.");
      } else {
        setEmailMessage("Email saved.");
      }
    } catch (requestError) {
      setEmailError(
        requestError.response?.data?.message ||
          "Could not save email. Please try again."
      );
    } finally {
      setIsEmailSaving(false);
    }
  }, [email, dispatch]);

  const resendVerification = useCallback(async () => {
    setIsSending(true);
    setEmailError("");
    setEmailMessage("");

    try {
      const { data } = await api.post("/users/me/email/verification");
      setEmailMessage(data.message || "Verification email sent. Check your inbox.");
    } catch (requestError) {
      setEmailError(
        requestError.response?.data?.message ||
          "Could not send verification email. Please try again."
      );
    } finally {
      setIsSending(false);
    }
  }, []);

  /**
   * Load account data from a /users/me API response (called from parent useEffect).
   */
  const loadFromUsersMe = useCallback((data) => {
    const fetchedEmail = data.email ?? "";
    setEmail(fetchedEmail);
    setSavedEmail(fetchedEmail);
    setEmailVerified(Boolean(data.emailVerified));
    setEmailVerifiedAt(data.emailVerifiedAt ?? null);
    dispatch(updateCurrentUser(data));
  }, [dispatch]);

  const normalizedInputEmail = (email ?? "").trim().toLowerCase();
  const normalizedSavedEmail = (savedEmail ?? "").trim().toLowerCase();
  const hasEmailChanges = normalizedInputEmail !== normalizedSavedEmail;

  return {
    email,
    savedEmail,
    emailVerified,
    emailVerifiedAt,
    isEmailSaving,
    isSending,
    emailMessage,
    emailError,
    onEmailChange,
    saveEmail,
    resendVerification,
    loadFromUsersMe,
    hasEmailChanges,
  };
}