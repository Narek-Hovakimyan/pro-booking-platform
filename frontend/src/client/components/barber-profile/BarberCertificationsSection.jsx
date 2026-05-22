import { Award, ShieldCheck } from "lucide-react";

import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function BarberCertificationsSection({
  certifications,
  eventCertifications,
  formatMonthYear,
  totalCerts,
}) {
  if (certifications.length === 0 && eventCertifications.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Award className="h-5 w-5" />
          Certifications
          {totalCerts > 0 && (
            <span className="text-sm font-normal text-neutral-400">
              ({totalCerts} {totalCerts === 1 ? "certificate" : "certificates"})
            </span>
          )}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {certifications.map((cert) => {
            const expired = cert.expiryDate
              ? new Date(cert.expiryDate) < new Date()
              : false;

            return (
              <div
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  expired ? "border-red-200" : "border-neutral-200"
                }`}
                key={cert._id}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50">
                    <Award className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-neutral-900">
                      {cert.title || "Certification"}
                    </div>
                    {cert.issuedBy && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        {cert.issuedBy}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      <span>Issued: {formatMonthYear(cert.issueDate)}</span>
                      {cert.expiryDate && (
                        <span>Expires: {formatMonthYear(cert.expiryDate)}</span>
                      )}
                    </div>
                    {expired && (
                      <span className="mt-1.5 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
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
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        href={getMediaUrl(cert.imageUrl)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Award className="h-3 w-3" />
                        View certificate
                      </a>
                    )}
                  </div>
                </div>
                {cert.imageUrl && (
                  <img
                    alt={`${cert.title || "Certificate"} image`}
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
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-900">
                    {cert.eventTitle || "Event certificate"}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {[cert.organizerName, cert.salonName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                    <span>Event: {formatMonthYear(cert.eventDate)}</span>
                    <span>Issued: {formatMonthYear(cert.issuedAt)}</span>
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    Verified event certificate
                  </span>
                  <Link
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    to={`/certificates/${cert.certificateId}`}
                  >
                    <Award className="h-3 w-3" />
                    View certificate
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
