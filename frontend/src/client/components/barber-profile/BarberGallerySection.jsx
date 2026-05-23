import { Images } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function BarberGallerySection({ barber, galleryImages }) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Images className="h-5 w-5" />
          Gallery
          {galleryImages.length > 0 && (
            <span className="text-sm font-normal text-neutral-400">
              ({galleryImages.length} {galleryImages.length === 1 ? "photo" : "photos"})
            </span>
          )}
        </h2>

        {!galleryImages.length ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <Images className="h-8 w-8 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">No gallery images yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {galleryImages.map((imageUrl) => (
              <div className="group relative overflow-hidden rounded-2xl" key={imageUrl}>
                <img
                  alt={`Work example by ${barber?.name || "specialist"}`}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  src={getMediaUrl(imageUrl)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
