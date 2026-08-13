import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import PaymentSettingsModal from "./PaymentSettingsModal";

const baseDraft = {
  type: "none",
  commissionStaffPercent: "",
  commissionSalonPercent: "",
  fixedAmount: "",
  fixedPeriod: "monthly",
  notes: "",
};

function ModalHarness({
  draft = baseDraft,
  error = "",
  isSaving = false,
  onChange = vi.fn(),
  onClose = vi.fn(),
  onSave = vi.fn(),
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open pay terms
      </button>
      {isOpen && (
        <PaymentSettingsModal
          draft={draft}
          error={error}
          isSaving={isSaving}
          staffName="Alex Barber"
          onChange={onChange}
          onClose={() => {
            onClose();
            setIsOpen(false);
          }}
          onSave={onSave}
        />
      )}
    </div>
  );
}

async function openModal(user) {
  const trigger = screen.getByRole("button", { name: "Open pay terms" });
  await user.click(trigger);
  return trigger;
}

describe("PaymentSettingsModal", () => {
  it("focuses the payment type and restores focus after close", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = await openModal(user);
    expect(screen.getByLabelText("Payment type")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Pay terms" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes through Escape and backdrop clicks in the existing callback order", async () => {
    const user = userEvent.setup();
    const calls = [];
    const onClose = vi.fn(() => calls.push("close"));
    render(<ModalHarness onClose={onClose} />);

    await openModal(user);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["close"]);

    await openModal(user);
    fireEvent.click(screen.getByRole("dialog", { name: "Pay terms" }).parentElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["close", "close"]);
  });

  it("keeps close and save controls disabled while saving", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<ModalHarness isSaving onClose={onClose} onSave={onSave} />);

    await openModal(user);
    expect(screen.getByLabelText("Payment type")).toBeDisabled();
    expect(screen.getByLabelText("Notes")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    await user.keyboard("{Escape}");
    fireEvent.click(screen.getByRole("dialog", { name: "Pay terms" }).parentElement);
    await user.click(screen.getByRole("button", { name: "Saving..." }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves local commission and fixed-payment validation", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ModalHarness
        draft={{
          ...baseDraft,
          type: "commission",
          commissionStaffPercent: "60",
          commissionSalonPercent: "30",
        }}
      />
    );

    await openModal(user);
    expect(screen.getByText("Commission split must add up to 100.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    rerender(
      <ModalHarness
        draft={{ ...baseDraft, type: "fixed", fixedAmount: "0" }}
      />
    );
    await openModal(user);
    expect(screen.getByText("Fixed pay requires an amount greater than 0.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renders save errors and preserves change/save callback ordering", async () => {
    const user = userEvent.setup();
    const calls = [];
    const onChange = vi.fn((field, value) => calls.push(["change", field, value]));
    const onSave = vi.fn(() => calls.push(["save"]));
    render(
      <ModalHarness
        draft={{
          ...baseDraft,
          type: "commission",
          commissionStaffPercent: "50",
          commissionSalonPercent: "50",
        }}
        error="Could not save pay terms."
        onChange={onChange}
        onSave={onSave}
      />
    );

    await openModal(user);
    expect(screen.getByText("Could not save pay terms.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "60/40" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(calls).toEqual([
      ["change", "commissionStaffPercent", 60],
      ["change", "commissionSalonPercent", 40],
      ["save"],
    ]);
  });
});
