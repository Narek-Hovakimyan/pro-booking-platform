import { Award, Calendar, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";

function formatMonthYear(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
  }).format(parsedDate);
}

export default function EventCertificatesSection({ eventCertificates }) {
  if (!eventCertificates || eventCertificates.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-neutral-950">
          Event certificates
        </h3>
        <p className="text-sm text-neutral-500">
          Certificates issued from events you attended.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(eventCertificates || []).map((cert) => (
          <div
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            key={cert?.certificateId || cert?.eventTitle || cert?.issuedAt}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-950">
                  {cert?.eventTitle || "Event certificate"}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {[cert?.organizerName, cert?.salonName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <Award className="h-3.5 w-3.5" />
                Event certificate
              </span>
            </div>

            <div className="mt-3 space-y-1 text-sm text-neutral-600">
              <p className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-neutral-400" />
                Event: {formatMonthYear(cert?.eventDate)}
              </p>
              <p>Issued: {formatMonthYear(cert?.issuedAt)}</p>
              <p className="break-all text-xs text-neutral-500">
                ID: {cert?.certificateId || "Certificate"}
              </p>
            </div>

            {cert?.certificateId && (
              <Button
                as={Link}
                className="mt-4 w-full"
                to={`/certificates/${cert.certificateId}`}
                variant="outline"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View certificate
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
