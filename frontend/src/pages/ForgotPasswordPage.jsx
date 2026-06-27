import { useState } from "react";
import { Link } from "react-router-dom";

import { forgotPassword } from "@/shared/api/auth";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const GENERIC_SUCCESS =
  "If an account exists, password reset instructions have been sent.";

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!phone.trim()) {
      setError("Enter the phone number for your account.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await forgotPassword(phone.trim());
      setSuccessMessage(response?.message || GENERIC_SUCCESS);
      setPhone("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not send reset instructions. Please try again."
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
              Reset your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500 sm:text-base">
              Enter your phone number and we will send reset instructions if
              the account exists.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-semibold" htmlFor="reset-phone">
                Phone number
              </label>
              <input
                id="reset-phone"
                autoComplete="tel"
                className="w-full rounded-2xl border p-3"
                disabled={isLoading}
                inputMode="tel"
                placeholder="Phone number"
                type="tel"
                value={phone}
                onChange={(event) => {
                  setError("");
                  setSuccessMessage("");
                  setPhone(event.target.value);
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

            <Button className="w-full" disabled={isLoading} type="submit">
              {isLoading ? "Sending..." : "Send reset instructions"}
            </Button>
          </form>

          <p className="text-sm text-neutral-500">
            Remembered your password?{" "}
            <Link
              className="font-semibold text-neutral-950 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              to="/login"
            >
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
