import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import CreateEventModal from "./CreateEventModal";
import CertificateIssueModal from "./CertificateIssueModal";
import RejectRegistrationModal from "./RejectRegistrationModal";
import CertificateRevokeModal from "./CertificateRevokeModal";

const eventForm = {
  title: "Event",
  description: "Description",
  type: "workshop",
  visibility: "public",
  instructor: "Instructor",
  instructorBio: "Bio",
  date: "2026-08-01",
  time: "09:30",
  duration: "60",
  price: "0",
  maxParticipants: "20",
  certificatesEnabled: false,
  locationType: "other",
  salonId: "",
  location: "Venue",
  imageUrl: "",
};

const noop = vi.fn();

function CreateEventModalHarness({
  initialForm = eventForm,
  manageableSalons = [],
  onClose = vi.fn(),
}) {
  const [form, setForm] = useState(initialForm);

  return (
    <CreateEventModal
      isOpen
      onClose={onClose}
      eventForm={form}
      onFieldChange={(field, value) =>
        setForm((currentForm) => ({ ...currentForm, [field]: value }))
      }
      validationErrors=""
      manageableSalons={manageableSalons}
      imagePreview=""
      isSubmitting={false}
      onSubmit={noop}
      onFileChange={noop}
      onSalonSelect={(salonId) =>
        setForm((currentForm) => ({
          ...currentForm,
          locationType: "salon",
          salonId,
        }))
      }
    />
  );
}

describe("event modal accessibility", () => {
  it("names the create dialog, labels every field, focuses title, and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const manageableSalons = [{ _id: "salon-1", name: "Salon One" }];
    render(
      <CreateEventModalHarness
        initialForm={eventForm}
        manageableSalons={manageableSalons}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Create Event" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close create event dialog" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Title *")).toHaveFocus();
    [
      "Title *", "Description", "Event type", "Visibility", "Instructor *",
      "Instructor Bio", "Date *", "Time * (HH:mm)", "Duration (min) *",
      "Price (AMD)", "Max Participants", "Event image", "Image URL fallback",
      "This event gives certificates", "Venue / Location *",
    ].forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /At my salon/i }));
    expect(screen.getByLabelText("Salon *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Venue / Location *")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Other location/i }));
    expect(screen.getByLabelText("Venue / Location *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Salon *")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Escape from bypassing a create submission", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CreateEventModal
        isOpen onClose={onClose} eventForm={eventForm} onFieldChange={noop}
        validationErrors="" manageableSalons={[]} imagePreview="" isSubmitting
        onSubmit={noop} onFileChange={noop} onSalonSelect={noop}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("provides names, labels, focus, and busy-safe Escape for certificate issue", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const setCertificateMode = vi.fn();
    render(
      <CertificateIssueModal
        isOpen onClose={onClose} certificateMode="uploaded" setCertificateMode={setCertificateMode}
        certificateFile={null} onFileChange={noop} onSubmit={noop} isSubmitting={false}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Issue Certificate" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close issue certificate dialog" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Auto-generated certificate")).toHaveFocus();
    expect(screen.getByLabelText("Auto-generated certificate")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload custom certificate")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom certificate file")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("labels rejection and revocation fields and respects busy Escape", async () => {
    const user = userEvent.setup();
    const onRejectClose = vi.fn();
    render(
      <RejectRegistrationModal
        isOpen registrationToReject={{ userName: "A" }} rejectionReason=""
        setRejectionReason={noop} isUpdatingRegistration onClose={onRejectClose} onSubmit={noop}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Reject Registration" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close reject registration dialog" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Reason for rejection")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onRejectClose).not.toHaveBeenCalled();

    const onRevokeClose = vi.fn();
    render(
      <CertificateRevokeModal
        isOpen onClose={onRevokeClose} revokeReason="" setRevokeReason={noop}
        onSubmit={noop} isSubmitting={false} certificateId="certificate-1"
      />,
    );
    expect(screen.getByRole("dialog", { name: "Revoke Certificate" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close revoke certificate dialog" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Reason for revocation")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onRevokeClose).toHaveBeenCalledOnce();
  });
});
