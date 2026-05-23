import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function GallerySection({ images = [] }) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <span role="img" aria-hidden="true">📸</span>
          Gallery
          {images.length > 0 && (
            <span className="text-sm font-normal text-neutral-400">
              ({images.length} {images.length === 1 ? "photo" : "photos"})
            </span>
          )}
        </h2>

        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <span className="text-2xl" role="img" aria-hidden="true">📷</span>
            <p className="text-sm text-neutral-500">No gallery images yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((imageUrl) => (
              <div
                className="group relative overflow-hidden rounded-2xl"
                key={imageUrl}
              >
                <img
                  alt="Gallery example of specialist work"
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
