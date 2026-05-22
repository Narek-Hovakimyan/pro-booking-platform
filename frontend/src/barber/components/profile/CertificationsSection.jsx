import { Link } from "react-router-dom";

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
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">
          🎓 Certifications
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {certifications.map((cert) => {
            const expired = cert.expiryDate
              ? new Date(cert.expiryDate) < new Date()
              : false;

            return (
              <div
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
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
                {expired && (
                  <span className="mt-1 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    Expired
                  </span>
                )}
                {cert.description && (
                  <p className="mt-2 text-xs text-neutral-500">
                    {cert.description}
                  </p>
                )}
                {cert.imageUrl && (
                  <a
                    className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:underline"
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
                    src={getMediaUrl(cert.imageUrl)}
                  />
                )}
              </div>
            );
          })}
          {eventCertifications.map((cert) => (
            <div
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
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
              <span className="mt-2 inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                Verified event certificate
              </span>
              <Link
                className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:underline"
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
