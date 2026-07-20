import CertificationsManager from "@/barber/components/CertificationsManager";
import EventCertificatesSection from "@/barber/components/settings/EventCertificatesSection";

export default function CertificationSettingsView({
  error,
  eventCertificates,
  isLoading,
}) {
  return (
    <>
      <h2 className="text-xl font-bold sm:text-2xl">Certifications</h2>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : (
        <>
          <CertificationsManager />
          <EventCertificatesSection eventCertificates={eventCertificates} />
        </>
      )}
    </>
  );
}
