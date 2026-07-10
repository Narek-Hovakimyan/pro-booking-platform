import { MapPin, BriefcaseBusiness, AtSign } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function ProfileAboutCard({
  bio,
  city,
  address,
  instagramHref,
  instagramHandle,
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
        <h2 className="font-bold text-white">About</h2>
      </div>
      <CardContent className="space-y-4 p-5">
        {bio ? (
          <p className="text-sm leading-6 text-neutral-600">{bio}</p>
        ) : (
          <p className="text-sm text-neutral-500">No bio added yet.</p>
        )}
        <div className="grid gap-3 border-t border-neutral-100 pt-4 text-sm text-neutral-600 sm:grid-cols-2">
          {city && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-neutral-400" />
              {city}
            </p>
          )}
          {address && (
            <p className="flex items-center gap-2">
              <BriefcaseBusiness className="h-4 w-4 text-neutral-400" />
              {address}
            </p>
          )}
          {instagramHref && (
            <a
              className="flex items-center gap-2 font-medium text-neutral-800 hover:text-neutral-950"
              href={instagramHref}
              rel="noreferrer"
              target="_blank"
            >
              <AtSign className="h-4 w-4 text-neutral-400" />
              {instagramHandle}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}