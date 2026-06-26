import { Link } from "react-router-dom";
import { Award } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";
import { formatMonthYear } from "@/barber/utils/profileHelpers";

export default function CertificationsSection({
  certifications = [],
  eventCertifications = [],
}) {
  if (certifications.length === 0 && eventCertifications.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      {/* Gradient header matching Phase 2 */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
        <Award className="h-5 w-5 text-white" />
        <h2 className="font-bold text-white">Certifications</h2>
      </div>

      <CardContent className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certifications.map((cert) => {
            const expired = cert.expiryDate
              ? new Date(cert.expiryDate) < new Date()
              : false;

            return (
              <div
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                key={cert._id}
              >
                <div className="font-semibold text-neutral-900">
                  {cert.title || "Certification"}
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  {cert.issuedBy || ""}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Issued: {formatMonthYear(cert.issueDate)}
                </p>
                {cert.expiryDate && (
                  <p className="text-xs text-neutral-500">
                    Expires: {formatMonthYear(cert.expiryDate)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {expired ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      Expired
                    </span>
                  ) : cert.expiryDate ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  ) : null}
                  {!expired && !cert.expiryDate && (
                    <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                      No expiry
                    </span>
                  )}
                </div>
                {cert.description && (
                  <p className="mt-2 text-xs text-neutral-500">
                    {cert.description}
                  </p>
                )}
                {cert.imageUrl && (
                  <a
                    className="mt-2 inline-flex text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline"
                    href={getMediaUrl(cert.imageUrl)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View certificate
                  </a>
                )}
                {cert.imageUrl && (
                  <img
                    alt={cert.title || "Certificate"}
                    className="mt-3 aspect-video w-full rounded-xl object-cover"
                    loading="lazy"
                    src={getMediaUrl(cert.imageUrl)}
                  />
                )}
              </div>
            );
          })}
          {eventCertifications.map((cert) => (
            <div
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              key={cert.certificateId}
            >
              <div className="font-semibold text-neutral-900">
                {cert.eventTitle || "Event certificate"}
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                {[cert.organizerName, cert.salonName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Event: {formatMonthYear(cert.eventDate)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Issued: {formatMonthYear(cert.issuedAt)}
              </p>
              <div className="mt-2">
                <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                  Verified event certificate
                </span>
              </div>
              <Link
                className="mt-3 inline-flex text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline"
                to={`/certificates/${cert.certificateId}`}
              >
                View certificate
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
