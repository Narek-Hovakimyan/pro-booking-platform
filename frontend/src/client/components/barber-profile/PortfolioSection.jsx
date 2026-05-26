import { useEffect, useState } from "react";
import { ImageOff, Images, Loader } from "lucide-react";

import { getPublicPortfolio } from "@/shared/api/portfolio";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function PortfolioSection({ barberId }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(!barberId);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!barberId) {
      return;
    }

    let mounted = true;

    async function fetchPortfolio() {
      setError("");
      setIsLoading(true);

      try {
        const data = await getPublicPortfolio(barberId);
        if (mounted) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.message || "Could not load portfolio photos"
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchPortfolio();

    return () => {
      mounted = false;
    };
  }, [barberId]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Images className="h-5 w-5" />
            Before / After
          </h2>
          <div className="flex items-center justify-center py-8 text-neutral-400">
            <Loader className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading portfolio...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Images className="h-5 w-5" />
            Before / After
          </h2>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Empty state — return nothing so the section is invisible ──
  if (items.length === 0) {
    return null;
  }

  // ── Filter out items missing required images ──
  const validItems = items.filter(
    (item) => item.beforeUrl && item.afterUrl
  );

  if (validItems.length === 0) {
    return null;
  }

  // ── Render portfolio cards ──
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Images className="h-5 w-5" />
          Before / After
          <span className="text-sm font-normal text-neutral-400">
            ({validItems.length} {validItems.length === 1 ? "set" : "sets"})
          </span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {validItems.map((item) => (
            <div
              key={item._id || item.id}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
            >
              {/* Side-by-side images */}
              <div className="grid grid-cols-2">
                <div className="relative border-r border-neutral-200">
                  <p className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Before
                  </p>
                  <div className="aspect-square overflow-hidden bg-neutral-100">
                    {item.beforeUrl ? (
                      <img
                        src={getMediaUrl(item.beforeUrl)}
                        alt="Before"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <p className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                    After
                  </p>
                  <div className="aspect-square overflow-hidden bg-neutral-100">
                    {item.afterUrl ? (
                      <img
                        src={getMediaUrl(item.afterUrl)}
                        alt="After"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Caption / category / tags */}
              {(item.caption || item.category) && (
                <div className="px-3 pb-3 pt-2">
                  {item.caption && (
                    <p className="text-sm font-semibold text-neutral-800 line-clamp-2">
                      {item.caption}
                    </p>
                  )}
                  {item.category && (
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {item.category}
                    </p>
                  )}
                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {item.tags.slice(0, 4).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
