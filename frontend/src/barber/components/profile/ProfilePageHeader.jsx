import { Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function ProfilePageHeader({ headline, onEditClick, saved }) {
  return (
    <div className="sticky top-0 z-30 border-b border-purple-100/50 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-neutral-950">Profile</h1>
          <p className="text-xs text-neutral-500">{headline || "Manage your public profile"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-neutral-400 sm:inline">
            {saved ? "Saved" : ""}
          </span>
          <Button
            className="bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-sm hover:from-purple-700 hover:to-pink-600"
            onClick={onEditClick}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit profile
          </Button>
        </div>
      </div>
    </div>
  );
}