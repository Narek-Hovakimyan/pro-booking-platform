import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const formatStatus = (status) => String(status || "unknown").replace(/_/g, " ");

function ReadModelSection({
  title,
  items,
  total,
  page,
  limit,
  loading,
  error,
  onPageChange,
  formatAmount,
  formatDate,
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 10)));

  return (
    <section className="space-y-2" aria-label={title}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h4>
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {!loading && !error && items?.length === 0 && (
        <p className="text-xs text-neutral-500">No {title.toLowerCase()} found.</p>
      )}
      {!loading && !error && items?.map((item) => (
        <div
          key={item.id}
          className="grid gap-2 rounded-xl border border-neutral-100 bg-white p-3 text-xs text-neutral-500 sm:grid-cols-4"
        >
          <div>
            <span className="block text-neutral-400">Amount</span>
            <strong className="text-neutral-800">{formatAmount(item.amount, item.currency)}</strong>
          </div>
          <div>
            <span className="block text-neutral-400">Status</span>
            <span className="font-medium text-neutral-700">{formatStatus(item.status)}</span>
          </div>
          <div>
            <span className="block text-neutral-400">Provider</span>
            <span className="font-medium text-neutral-700">{item.provider || "manual"}</span>
          </div>
          <div>
            <span className="block text-neutral-400">Date</span>
            <span className="font-medium text-neutral-700">
              {formatDate(item.paidAt || item.createdAt)}
            </span>
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1 text-xs">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}

export function IndividualPaymentReadModels({
  state,
  onTransactionsPageChange,
  onAttemptsPageChange,
  formatAmount,
  formatDate,
}) {
  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 p-3 lg:grid-cols-2">
      <ReadModelSection
        title="Transactions"
        items={state.transactions || []}
        total={state.transactionsTotal}
        page={state.transactionsPage || 1}
        limit={state.transactionsLimit}
        loading={state.transactionsLoading}
        error={state.transactionsError}
        onPageChange={onTransactionsPageChange}
        formatAmount={formatAmount}
        formatDate={formatDate}
      />
      <ReadModelSection
        title="Payment Attempts"
        items={state.paymentAttempts || []}
        total={state.attemptsTotal}
        page={state.attemptsPage || 1}
        limit={state.attemptsLimit}
        loading={state.attemptsLoading}
        error={state.attemptsError}
        onPageChange={onAttemptsPageChange}
        formatAmount={formatAmount}
        formatDate={formatDate}
      />
    </div>
  );
}
