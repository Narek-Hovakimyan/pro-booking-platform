import { useState } from "react";
import { getMediaUrl } from "@/shared/utils/media";
import {
  formatDateSeparator,
  formatMessageTime,
  getMessageDateKey,
} from "@/shared/utils/messageTime";

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

export default function MessageBubble({ message, isMine, currentUser, previousMessage }) {
  const getMessageId = (m) => m?.id || m?._id;
  const shouldShowDate =
    getMessageDateKey(previousMessage?.createdAt) !==
    getMessageDateKey(message?.createdAt);
  const messageTime = formatMessageTime(message?.createdAt);

  return (
    <div key={getMessageId(message)}>
      {shouldShowDate && (
        <div className="my-4 text-center text-xs font-medium text-neutral-500">
          <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 shadow-sm">
            {formatDateSeparator(message?.createdAt)}
          </span>
        </div>
      )}
      <div
        className={`flex items-end gap-2 ${
          isMine ? "flex-row-reverse" : "flex-row"
        }`}
      >
        <AvatarCircle
          name={
            isMine
              ? currentUser?.name || "You"
              : message.sender?.name || "User"
          }
          size="sm"
          src={
            isMine
              ? currentUser?.avatarUrl || currentUser?.imageUrl || currentUser?.image || currentUser?.avatar
              : message.sender?.avatarUrl
          }
        />
        <div
          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
            isMine
              ? "rounded-br-md bg-brand-600 text-white"
              : "rounded-bl-md border border-neutral-200 bg-white text-neutral-900"
          }`}
        >
          <p className="whitespace-pre-wrap break-words leading-6">
            {message?.text || ""}
          </p>
          {messageTime && (
            <p
              className={`mt-1 text-[11px] ${
                isMine ? "text-brand-100" : "text-neutral-500"
              }`}
            >
              {messageTime}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
