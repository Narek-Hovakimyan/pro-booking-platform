import { Award, ExternalLink } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  getCertificate,
  getRegistrationStatusClasses,
  getRegistrationStatusLabel,
} from "@/features/events/utils/eventFormatters";

export default function EventRegistrationManager({
  event,
  registrations,
  groupedRegistrations,
  isLoading,
  message,
  isSubmitting,
  pendingCount,
  selectedEventHasCertificates,
  selectedEventEnded,
  onApprove,
  onReject,
  onMoveToWaitlist,
  onCheckIn,
  onIssueCertificate,
  onRevokeCertificate,
}) {
  return (
    <div className="mt-6 space-y-3 rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">
            Registration Requests
          </h3>
          <p className="text-sm text-neutral-500">
            Pending requests must be approved before a user becomes a participant.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          Pending {pendingCount}
        </span>
      </div>

      {message && (
        <p
          className={`rounded-xl border p-3 text-sm ${
            message.includes("Could not") ||
            message.includes("Not authorized")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="h-16 animate-pulse rounded-xl bg-neutral-100"
            />
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No registration requests yet.
        </p>
      ) : (
        <div className="space-y-4">
          {groupedRegistrations.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-900">
                  {group.label}
                </h4>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                  {group.items.length}
                </span>
              </div>
              {group.items.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  No {group.label.toLowerCase()}.
                </p>
              ) : (
                group.items.map((registration) => {
                  const certificate = getCertificate(registration);
                  const certificateIssued =
                    certificate?.status === "issued";
                  const certificateRevoked =
                    certificate?.status === "revoked";
                  const canIssueCertificate =
                    selectedEventHasCertificates &&
                    selectedEventEnded &&
                    registration?.status === "approved" &&
                    registration?.attended &&
                    !certificate;

                  return (
                  <div
                    key={registration?._id}
                    className="rounded-xl border border-neutral-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {registration?.userName || "User"}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {[
                            registration?.userPhone,
                            registration?.userCity,
                            registration?.userRole,
                          ]
                            .filter(Boolean)
                            .join(" · ") ||
                            registration?.userEmail ||
                            ""}
                        </p>
                        {registration?.message && (
                          <p className="mt-1 text-xs text-neutral-600">
                            Message: {registration.message}
                          </p>
                        )}
                        {registration?.createdAt && (
                          <p className="mt-1 text-xs text-neutral-400">
                            Requested {new Date(registration.createdAt).toLocaleString()}
                          </p>
                        )}
                        {registration?.checkedInAt && (
                          <p className="mt-1 text-xs text-green-700">
                            Attended · {new Date(registration.checkedInAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getRegistrationStatusClasses(
                          registration?.status
                        )}`}
                      >
                        {registration?.attended &&
                        registration?.status === "approved"
                          ? "Attended"
                          : getRegistrationStatusLabel(
                              registration?.status
                            )}
                      </span>
                    </div>

                    {certificate && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                        <Award className="h-3.5 w-3.5" />
                        <span className="font-semibold">
                          {certificateIssued
                            ? "Certificate issued"
                            : "Certificate revoked"}
                        </span>
                        <span>{certificate.certificateId}</span>
                        <Button
                          as="a"
                          href={`/certificates/${certificate.certificateId}`}
                          size="sm"
                          target="_blank"
                          variant="outline"
                        >
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          View
                        </Button>
                      </div>
                    )}

                    {registration?.rejectionReason && (
                      <p className="mt-2 text-xs text-red-600">
                        Reason: {registration.rejectionReason}
                      </p>
                    )}

                    {(registration?.status === "pending" ||
                      registration?.status === "waitlisted") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="flex-1"
                          disabled={isSubmitting}
                          onClick={() =>
                            onApprove(
                              event._id,
                              registration._id
                            )
                          }
                          size="sm"
                        >
                          Approve
                        </Button>
                        <Button
                          className="flex-1"
                          disabled={isSubmitting}
                          onClick={() =>
                            onReject(registration)
                          }
                          size="sm"
                          variant="outline"
                        >
                          Reject
                        </Button>
                        {registration?.status === "pending" && (
                          <Button
                            className="w-full"
                            disabled={isSubmitting}
                            onClick={() =>
                              onMoveToWaitlist(
                                event._id,
                                registration._id
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            Move to Waitlist
                          </Button>
                        )}
                      </div>
                    )}

                    {registration?.status === "approved" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="flex-1"
                          disabled={
                            isSubmitting ||
                            registration?.attended
                          }
                          onClick={() =>
                            onCheckIn(
                              event._id,
                              registration._id
                            )
                          }
                          size="sm"
                          variant="outline"
                        >
                          {registration?.attended
                            ? "Attended"
                            : "Mark Attended"}
                        </Button>
                        {canIssueCertificate && (
                          <Button
                            className="flex-1"
                            disabled={isSubmitting}
                            onClick={() =>
                              onIssueCertificate(
                                event._id,
                                registration._id
                              )
                            }
                            size="sm"
                          >
                            Issue Certificate
                          </Button>
                        )}
                        {certificateIssued && (
                          <Button
                            className="flex-1"
                            disabled={isSubmitting}
                            onClick={() => {
                              onRevokeCertificate(certificate);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            Revoke Certificate
                          </Button>
                        )}
                        {certificateRevoked && (
                          <span className="flex min-h-9 flex-1 items-center justify-center rounded-xl bg-red-50 px-3 text-sm font-semibold text-red-700">
                            Certificate revoked
                          </span>
                        )}
                        <Button
                          className="flex-1"
                          disabled={isSubmitting}
                          onClick={() =>
                            onMoveToWaitlist(
                              event._id,
                              registration._id
                            )
                          }
                          size="sm"
                          variant="outline"
                        >
                          Move to Waitlist
                        </Button>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
