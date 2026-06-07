const formatMoney = (value) => {
  const numericValue = Number(value);
  return `${(Number.isFinite(numericValue) ? numericValue : 0).toLocaleString()} դրամ`;
};

export default function DepositNotice({
  originalPrice = 0,
  discountAmount = 0,
  finalPrice = 0,
  depositAmount = 0,
  remainingDue = 0,
  policyText = "",
  className = "",
}) {
  const safeDiscountAmount = Math.max(0, Number(discountAmount || 0));

  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 ${className}`}
    >
      <div className="font-semibold">Deposit required</div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span>Original price</span>
          <span className="font-semibold">{formatMoney(originalPrice)}</span>
        </div>

        {safeDiscountAmount > 0 && (
          <div className="flex items-center justify-between gap-4 text-amber-800">
            <span>Discount</span>
            <span className="font-semibold">-{formatMoney(safeDiscountAmount)}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 text-amber-800">
          <span>Final price</span>
          <span className="font-semibold">{formatMoney(finalPrice)}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span>Deposit amount</span>
          <span className="font-bold">{formatMoney(depositAmount)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 text-amber-800">
          <span>Remaining due at appointment</span>
          <span className="font-semibold">{formatMoney(remainingDue)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-amber-800">
        Deposit payment is pending. Online payment integration is not enabled yet.
      </p>

      {policyText && (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          {policyText}
        </p>
      )}
    </div>
  );
}
