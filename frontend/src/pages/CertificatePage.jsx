import { Award, Download, Eye, Printer, ShieldCheck, XCircle, AlertTriangle, Loader2, FileText, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";

const formatDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const dateOnly = new Date(`${value}T00:00:00`);
    return Number.isNaN(dateOnly.getTime())
      ? "Not available"
      : dateOnly.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getApiOrigin = () => {
  const explicitBaseUrl = import.meta.env.VITE_API_URL || api.defaults.baseURL || "";

  try {
    return explicitBaseUrl ? new URL(explicitBaseUrl).origin : window.location.origin;
  } catch {
    return window.location.origin;
  }
};

const resolveCertificateFileUrl = (fileUrl) => {
  if (!fileUrl) return "";

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const normalizedPath = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;

  return `${getApiOrigin()}${normalizedPath}`;
};

export default function CertificatePage() {
  const { certificateId } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchCertificate() {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get(`/certificates/${certificateId}`);

        if (isMounted) {
          setCertificate(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Certificate not found");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchCertificate();

    return () => {
      isMounted = false;
    };
  }, [certificateId]);

  // ── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-neutral-50 print:bg-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
          <p className="text-sm font-medium text-neutral-500">Loading certificate...</p>
        </div>
      </div>
    );
  }

  // ── Error / Not Found State ─────────────────────────────────────────────────
  if (error || !certificate) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-neutral-50 p-4 print:bg-white">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-neutral-900">Certificate not found</h2>
          <p className="mt-2 text-sm text-neutral-500">
            {error || "The certificate you are looking for does not exist or has been removed."}
          </p>
          <p className="mt-6 text-xs text-neutral-400">
            Certificate ID: <span className="font-mono">{certificateId}</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  const isRevoked = certificate.status === "revoked";
  const resolvedFileUrl = resolveCertificateFileUrl(certificate.fileUrl);
  const hasUploadedFile = certificate.certificateType === "uploaded" && resolvedFileUrl;
  const isImageFile = certificate.fileType?.startsWith("image/");

  return (
    <div className="min-h-screen bg-neutral-50 py-6 sm:py-10 print:min-h-0 print:bg-white print:py-0">
      {/* ── Action buttons (hidden when printing) ──────────────────────────── */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-center gap-3 px-4 print:hidden sm:mb-8">
        <Button onClick={() => window.print()} size="lg">
          <Printer className="mr-2 h-4 w-4" />
          Print / Save as PDF
        </Button>
        {hasUploadedFile && !isImageFile && (
          <>
            <a
              href={resolvedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg">
                <Eye className="mr-2 h-4 w-4" />
                View uploaded certificate
              </Button>
            </a>
            <a
              href={resolvedFileUrl}
              download={certificate.originalFileName || "certificate.pdf"}
            >
              <Button variant="outline" size="lg">
                <Download className="mr-2 h-4 w-4" />
                Download file
              </Button>
            </a>
          </>
        )}
      </div>

      {/* ── Certificate Card ──────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-3xl justify-center px-4">
        <section
          className={`
            relative w-full overflow-hidden rounded-[2rem] border bg-white shadow-xl
            print:rounded-none print:border print:border-neutral-300 print:shadow-none print:break-inside-avoid
            ${isRevoked ? "border-red-200" : "border-neutral-200"}
          `}
        >
          {/* ── Decorative inner borders ────────────────────────────────────── */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(23,23,23,0.03),transparent_24%,transparent_76%,rgba(23,23,23,0.03))] print:hidden" />
          <div className="pointer-events-none absolute inset-4 rounded-[1.6rem] border border-neutral-200/70 print:hidden" />
          <div className="pointer-events-none absolute inset-7 rounded-[1.3rem] border border-neutral-100 print:hidden" />

          {/* ── Revoked overlay watermark ───────────────────────────────────── */}
          {isRevoked && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-[0.04] print:opacity-[0.06]">
              <span className="rotate-[-30deg] text-[12rem] font-black uppercase tracking-[0.15em] text-red-600">
                Revoked
              </span>
            </div>
          )}

          <div className="relative px-5 py-8 sm:px-10 sm:py-10 print:px-6 print:py-6">
            {/* ── Status badge ──────────────────────────────────────────────── */}
            <div className="mb-6 flex flex-col items-center gap-3 sm:mb-8">
              <span
                className={`
                  inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em]
                  ${isRevoked ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}
                `}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isRevoked ? "bg-red-500" : "bg-emerald-500"}`}
                />
                {isRevoked ? (
                  <>
                    <XCircle className="mr-0.5 h-3.5 w-3.5" />
                    Revoked
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-0.5 h-3.5 w-3.5" />
                    Valid certificate
                  </>
                )}
              </span>

              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified by HairBook
              </div>
            </div>

            {/* ── Revoked warning ───────────────────────────────────────────── */}
            {isRevoked && (
              <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-center print:border-red-300 print:bg-red-50">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-red-700">
                  <XCircle className="h-5 w-5" />
                  This certificate has been revoked.
                </div>
                {certificate.revokedReason && (
                  <p className="mt-2 text-sm text-red-600">
                    Reason: {certificate.revokedReason}
                  </p>
                )}
                {certificate.revokedAt && (
                  <p className="mt-1 text-xs text-red-500">
                    Revoked on {formatDate(certificate.revokedAt)}
                  </p>
                )}
              </div>
            )}

            {/* ── Main certificate content ──────────────────────────────────── */}
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              {/* Icon */}
              <div
                className={`
                  mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border sm:h-20 sm:w-20
                  ${isRevoked ? "border-red-200 bg-red-50" : "border-neutral-900/10 bg-neutral-950"}
                  print:shadow-none
                `}
              >
                {isRevoked ? (
                  <XCircle className="h-8 w-8 text-red-600 sm:h-9 sm:w-9" />
                ) : (
                  <Award className="h-8 w-8 text-white sm:h-9 sm:w-9" />
                )}
              </div>

              {/* Title */}
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-neutral-400 sm:text-xs">
                Official Recognition
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-neutral-800 sm:mt-4 sm:text-3xl">
                Certificate of Participation
              </h1>

              {/* Presented to */}
              <div className="mt-6 w-full border-t border-neutral-100 pt-6 sm:mt-8 sm:pt-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400 sm:text-xs">
                  This certifies that
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:mt-3 sm:text-4xl">
                  {certificate.participantName}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-neutral-500 sm:text-base">
                  participated in
                </p>
              </div>

              {/* Event title */}
              <div className="mt-4 max-w-xl border-b border-neutral-200 pb-4 sm:mt-5 sm:pb-5">
                <p className="text-xl font-semibold text-neutral-900 sm:text-2xl">
                  {certificate.eventTitle}
                </p>
              </div>

              {/* Organizer / Salon / Dates */}
              <div className="mt-6 grid w-full gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                    Organizer
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-neutral-900 sm:text-base">
                    {certificate.organizerName || "Not specified"}
                  </p>
                </div>
                {certificate.salonName && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 sm:rounded-2xl sm:p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                      Salon
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-neutral-900 sm:text-base">
                      {certificate.salonName}
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                    Event Date
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-neutral-900 sm:text-base">
                    {formatDate(certificate.eventDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                    Issued
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-neutral-900 sm:text-base">
                    {formatDate(certificate.issuedAt)}
                  </p>
                </div>
              </div>

              {/* ── Certificate ID and footer ────────────────────────────────── */}
              <div className="mt-6 flex w-full flex-col items-center gap-3 border-t border-neutral-100 pt-5 sm:mt-8 sm:flex-row sm:justify-between sm:pt-6">
                <div className="text-center sm:text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                    Certificate ID
                  </p>
                  <p className="mt-1 break-all font-mono text-xs font-semibold text-neutral-600 sm:text-sm">
                    {certificate.certificateId}
                  </p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-[11px]">
                    Verified Event Document
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                    HairBook Events
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Uploaded file section (hidden when printing) ────────────────────── */}
      {hasUploadedFile && (
        <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm print:hidden sm:mt-8 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span
              className={`
                inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]
                ${isRevoked ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-700"}
              `}
            >
              <FileText className="h-3.5 w-3.5" />
              {isImageFile ? "Uploaded Image" : "Uploaded PDF"}
            </span>
            <span className="truncate text-right text-xs text-neutral-500 sm:text-sm">
              {certificate.originalFileName || "Uploaded certificate file"}
            </span>
          </div>

          {isRevoked && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-xs font-medium text-red-700">
              ⚠ This uploaded certificate corresponds to a revoked certificate record.
            </div>
          )}

          {isImageFile ? (
            <div>
              <div className="flex items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50">
                <img
                  alt={`Uploaded certificate image for ${certificate.participantName || "participant"}`}
                  className="max-h-96 w-full object-contain"
                  src={resolvedFileUrl}
                />
              </div>
              <a
                href={resolvedFileUrl}
                download={certificate.originalFileName || "certificate"}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                <Download className="h-4 w-4" />
                Download{certificate.originalFileName ? ` ${certificate.originalFileName}` : " image"}
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <a
                href={resolvedFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
              >
                <Eye className="h-4 w-4" />
                View PDF Certificate
              </a>
              <a
                href={resolvedFileUrl}
                download={certificate.originalFileName || "certificate.pdf"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
