import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 5 * 1024 * 1024;

export default function AvatarUploadButton({
  uploadUrl,
  disabled = false,
  label = "Change image",
  onUploaded,
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const openFilePicker = () => {
    setError("");
    inputRef.current?.click();
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!allowedImageTypes.has(file.type)) {
      setError("Choose a JPEG, PNG, or WEBP image.");
      return;
    }

    if (file.size > maxImageSize) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    setIsUploading(true);
    setError("");

    try {
      const { data } = await api.put(uploadUrl, formData);
      onUploaded?.(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not upload image. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        ref={inputRef}
        type="file"
        onChange={uploadAvatar}
      />

      <Button
        disabled={disabled || isUploading}
        onClick={openFilePicker}
        type="button"
        variant="outline"
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        {isUploading ? "Uploading..." : label}
      </Button>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
