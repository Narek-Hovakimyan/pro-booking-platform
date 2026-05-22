function formatReplyDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function ReviewReplyBlock({ reply }) {
  const message = typeof reply?.message === "string" ? reply.message.trim() : "";

  if (!message) return null;

  const updatedDate = formatReplyDate(reply?.updatedAt);

  return (
    <div className="mt-3 border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Official reply
        </p>
        {updatedDate && (
          <time className="text-xs text-neutral-400" dateTime={reply.updatedAt}>
            {updatedDate}
          </time>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
        {message}
      </p>
    </div>
  );
}
