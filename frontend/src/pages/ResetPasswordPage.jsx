import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { resetPassword } from "@/shared/api/auth";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const hasToken = Boolean(token);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!hasToken) {
      setError("This reset link is missing or invalid. Request a new link.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await resetPassword(token, password);
      setSuccessMessage(
        response?.message || "Your password has been reset. You can now log in."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not reset your password. Request a new link and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-xl items-center px-1 py-8">
      <Card className="w-full overflow-hidden rounded-2xl shadow-lg shadow-purple-100/80 sm:rounded-3xl">
        <div className="h-1.5 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500" />
        <CardContent className="space-y-6 p-5 sm:p-7">
          <div>
            <p className="text-sm font-semibold text-purple-700">
              Account access
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Create a new password
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500 sm:text-base">
              Use at least 8 characters. You will need to log in after the
              password is changed.
            </p>
          </div>

          {!hasToken && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              This reset link is missing or invalid. Request a new link.
            </p>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-semibold" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                autoComplete="new-password"
                className="w-full rounded-2xl border p-3"
                disabled={isLoading || !hasToken || Boolean(successMessage)}
                placeholder="New password"
                type="password"
                value={password}
                onChange={(event) => {
                  setError("");
                  setPassword(event.target.value);
                }}
              />
            </div>

            <div className="grid gap-2">
              <label
                className="text-sm font-semibold"
                htmlFor="confirm-password"
              >
                Confirm password
              </label>
              <input
                id="confirm-password"
                autoComplete="new-password"
                className="w-full rounded-2xl border p-3"
                disabled={isLoading || !hasToken || Boolean(successMessage)}
                placeholder="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setError("");
                  setConfirmPassword(event.target.value);
                }}
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {successMessage && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {successMessage}
              </p>
            )}

            <Button
              className="w-full"
              disabled={isLoading || !hasToken || Boolean(successMessage)}
              type="submit"
            >
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              className="font-semibold text-neutral-950 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              to="/login"
            >
              Back to login
            </Link>
            {!successMessage && (
              <Link
                className="font-semibold text-purple-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                to="/forgot-password"
              >
                Request a new link
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
