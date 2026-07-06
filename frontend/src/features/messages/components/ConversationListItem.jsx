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
  const hasUnread = conversation.unreadCount > 0;
  let itemToneClass = "border-neutral-200 bg-white shadow-sm hover:bg-neutral-50";

  if (hasUnread) {
    itemToneClass =
      "border-brand-100 bg-white shadow-sm hover:border-brand-200 hover:bg-brand-50/50";
  }

  if (isSelected) {
    itemToneClass = "border-brand-200 bg-brand-50 shadow-card ring-2 ring-brand-100";
  }

  return (
    <button
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${itemToneClass}`}
      key={conversation.id}
      onClick={() => onSelect?.(conversation)}
      type="button"
    >
      <AvatarCircle
        className={hasUnread ? "ring-2 ring-brand-100" : ""}
        name={participantName}
        src={conversation?.avatarUrl}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold text-neutral-950">
            {participantName}
          </span>
          {lastMessageTime && (
            <span className="shrink-0 text-[11px] text-neutral-400">
              {lastMessageTime}
            </span>
          )}
        </span>
        <span
          className={`mt-1 block truncate text-xs ${
            hasUnread ? "font-medium text-neutral-700" : "text-neutral-500"
          }`}
        >
          {lastMessageText}
        </span>
      </span>
      {hasUnread && (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 px-2 text-xs font-semibold text-white">
          {conversation.unreadCount}
        </span>
      )}
    </button>
  );
}
