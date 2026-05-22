import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

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

export default function ChatHeader({ selectedUser, onBackToList }) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
      <Button
        className="lg:hidden"
        onClick={onBackToList}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <AvatarCircle
        name={selectedUser?.name || "User"}
        src={selectedUser?.avatarUrl}
      />

      <div className="min-w-0">
        <h2 className="truncate text-xl font-bold">
          {selectedUser?.name || "User"}
        </h2>
        <p className="truncate text-sm text-neutral-500">
          {selectedUser?.role || selectedUser?.phone || ""}
        </p>
      </div>
    </div>
  );
}
