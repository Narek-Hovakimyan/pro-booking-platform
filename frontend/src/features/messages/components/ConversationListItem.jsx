import { useState } from "react";
import { getMediaUrl } from "@/shared/utils/media";
import { formatConversationTime } from "@/shared/utils/messageTime";

const getInitial = (name = "User") => name.trim().charAt(0).toUpperCase() || "U";

function AvatarCircle({ src, name, size = "md", className = "" }) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = size === "sm" ? "h-6 w-6" : "h-11 w-11";
  const textClasses = size === "sm" ? "text-[10px]" : "text-sm";

  return (
    <span
      className={`${sizeClasses} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ${className}`}
    >
      {src && !imgError ? (
        <img
          alt={name || "User"}
          className="h-full w-full object-cover"
          src={getMediaUrl(src)}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={`${textClasses} font-bold text-neutral-600`}>
          {getInitial(name)}
        </span>
      )}
    </span>
  );
}

export { AvatarCircle };

export default function ConversationListItem({
  conversation,
  isSelected = false,
  onSelect,
}) {
  const participantName = conversation?.name || "User";
  const lastMessage = conversation?.lastMessage || {};
  const lastMessageText = lastMessage?.text || "";
  const lastMessageTime = formatConversationTime(
    lastMessage?.createdAt || conversation?.lastMessageAt
  );

  return (
    <button
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition ${
        isSelected
          ? "border-neutral-900 bg-neutral-100 ring-2 ring-neutral-900/10"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
      key={conversation.id}
      onClick={() => onSelect?.(conversation)}
      type="button"
    >
      <AvatarCircle name={participantName} src={conversation?.avatarUrl} />

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold">{participantName}</span>
          {lastMessageTime && (
            <span className="shrink-0 text-[11px] text-neutral-400">
              {lastMessageTime}
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-neutral-500">
          {lastMessageText}
        </span>
      </span>
      {conversation.unreadCount > 0 && (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
          {conversation.unreadCount}
        </span>
      )}
    </button>
  );
}
