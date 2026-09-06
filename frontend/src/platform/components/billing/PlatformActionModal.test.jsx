import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PlatformActionModal } from "./PlatformActionModal";

function ModalHarness({
  children,
  error = "",
  isSubmitting = false,
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  onOuterEscape = vi.fn(),
  removeTriggerOnConfirm = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);
  const fallbackFocusRef = useRef(null);

  const handleConfirm = (note) => {
    onConfirm(note);
    if (removeTriggerOnConfirm) setShowTrigger(false);
    setIsOpen(false);
  };

  return (
    <div
      ref={fallbackFocusRef}
      aria-label="Billing action area"
      onKeyDown={(event) => {
        if (event.key === "Escape") onOuterEscape();
      }}
      role="region"
      tabIndex={-1}
    >
      {showTrigger && (
        <button type="button" onClick={() => setIsOpen(true)}>
          Open action
        </button>
      )}
      <button type="button">Background action</button>
      <PlatformActionModal
        fallbackFocusRef={fallbackFocusRef}
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        error={error}
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
        onConfirm={handleConfirm}
        title="Cancel subscription"
        warning="This action cannot be undone."
        confirmLabel="Cancel subscription"
      >
        {children}
      </PlatformActionModal>
    </div>
  );
}

function SubmittingHarness({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fallbackFocusRef = useRef(null);

  return (
    <div ref={fallbackFocusRef} aria-label="Billing action area" role="region" tabIndex={-1}>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open action
      </button>
      <button type="button">Background action</button>
      <PlatformActionModal
        fallbackFocusRef={fallbackFocusRef}
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        onClose={() => setIsOpen(false)}
        onConfirm={() => setIsSubmitting(true)}
        title="Cancel subscription"
        warning="This action cannot be undone."
        confirmLabel="Cancel subscription"
      >
        {children}
      </PlatformActionModal>
    </div>
  );
}

async function openModal(user) {
  const trigger = screen.getByRole("button", { name: "Open action" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Cancel subscription" });
  return { dialog, trigger };
}

describe("PlatformActionModal", () => {
  it("uses named modal semantics and focuses Cancel on open", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const { dialog } = await openModal(user);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("traps Tab in both directions with optional fields", async () => {
    const user = userEvent.setup();
    render(
      <ModalHarness>
        <input aria-label="Seat count" />
      </ModalHarness>
    );
    const { dialog } = await openModal(user);
    const closeButton = screen.getByRole("button", { name: "Close modal" });
    await user.type(screen.getByLabelText(/Audit note/), "approved");
    const confirmButton = screen.getByRole("button", { name: "Cancel subscription" });

    closeButton.focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirmButton).toHaveFocus();

    confirmButton.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement);
  });

  it("closes with Escape without confirming and restores the opener", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ModalHarness onConfirm={onConfirm} />);
    const { trigger } = await openModal(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("closes with Cancel and restores the opener", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const { trigger } = await openModal(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores the opener after a successful confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ModalHarness onConfirm={onConfirm} />);
    const { trigger } = await openModal(user);

    await user.type(screen.getByLabelText(/Audit note/), "approved");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));

    expect(onConfirm).toHaveBeenCalledWith("approved");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the modal open for Escape while submitting and announces busy and errors", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onOuterEscape = vi.fn();
    render(
      <ModalHarness
        error="Request failed."
        isSubmitting
        onClose={onClose}
        onConfirm={onConfirm}
        onOuterEscape={onOuterEscape}
      />
    );
    const { dialog } = await openModal(user);

    await user.keyboard("{Escape}");

    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Action in progress.");
    expect(screen.getByRole("alert")).toHaveTextContent("Request failed.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(dialog).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOuterEscape).not.toHaveBeenCalled();
  });

  it("keeps focus on the dialog when submission disables every modal control", async () => {
    const user = userEvent.setup();
    render(<SubmittingHarness />);
    await openModal(user);

    await user.type(screen.getByLabelText(/Audit note/), "approved");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel subscription" });

    await waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(dialog).toHaveFocus();
  });

  it("keeps focus contained after submission with an optional input", async () => {
    const user = userEvent.setup();
    render(
      <SubmittingHarness>
        <input aria-label="Seat count" />
      </SubmittingHarness>
    );
    await openModal(user);

    await user.type(screen.getByLabelText(/Audit note/), "approved");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel subscription" });

    await waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(screen.getByLabelText("Seat count")).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByLabelText("Seat count")).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement);
  });

  it("uses the fallback safely when successful confirmation removes the opener", async () => {
    const user = userEvent.setup();
    render(<ModalHarness removeTriggerOnConfirm />);
    await openModal(user);

    await user.type(screen.getByLabelText(/Audit note/), "approved");
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Open action" })).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Billing action area" })).toHaveFocus();
    });
  });

  it("does not throw when unmounted while open", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ModalHarness />);
    await openModal(user);

    expect(() => unmount()).not.toThrow();
  });
});
