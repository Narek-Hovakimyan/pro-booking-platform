export default function MessagesPageHeader() {
  return (
    <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-card sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
        Inbox
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
        Messages
      </h1>
      <p className="mt-2 text-sm leading-6 text-neutral-500">
        Chat with clients and specialists.
      </p>
    </div>
  );
}
