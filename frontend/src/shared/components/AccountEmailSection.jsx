import { Button } from "@/shared/components/ui/button";

export default function AccountEmailSection({
  email = "",
  emailVerified = false,
  emailVerifiedAt = null,
  isSaving = false,
  isSending = false,
  message = "",
  error = "",
  onEmailChange,
  onResend,
}) {
  const statusLabel = (() => {
    if (!email) return "No email added";
    if (emailVerified) return "Verified";
    return "Unverified";
  })();

  const statusColor = (() => {
    if (!email) return "text-neutral-400";
    if (emailVerified) return "text-emerald-600";
    return "text-amber-600";
  })();

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Account email</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your email is used for account-related notifications. It is not shown on your
          public profile.
        </p>
      </div>

      <label className="block text-sm font-semibold">
        <span>Email address</span>
        <input
          className="mt-2 w-full rounded-2xl border p-3 font-normal"
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => onEmailChange?.(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>

        {emailVerified && emailVerifiedAt && (
          <span className="text-xs text-neutral-400">
            verified {new Date(emailVerifiedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {email && !emailVerified && (
        <Button
          variant="outline"
          size="default"
          disabled={isSending || isSaving}
          onClick={onResend}
        >
          {isSending ? "Sending..." : "Resend verification"}
        </Button>
      )}

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {email && !emailVerified && !message && (
        <p className="text-sm text-neutral-500">
          Check your email to verify this address.
        </p>
      )}
    </div>
  );
}
