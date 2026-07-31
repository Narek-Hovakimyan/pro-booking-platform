import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalonPromotionsManager from "./SalonPromotionsManager";
import ServiceFormModal from "./services/ServiceFormModal";
import ManagedSalonsSection from "./settings/ManagedSalonsSection";
import BarberSettings from "./BarberSettings";
import ConfirmModal from "@/shared/components/common/ConfirmModal";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/barber/components/settings/BarberSettingsLayout", () => ({
  default: ({ children, confirmation }) => (
    <div>
      {children}
      {confirmation}
    </div>
  ),
}));

vi.mock("@/barber/components/settings/salon/SalonSettingsView", () => ({
  default: ({ onOpenLeaveConfirmation }) => (
    <button type="button" onClick={() => onOpenLeaveConfirmation("Salon One", "salon-1")}>
      Open leave confirmation
    </button>
  ),
}));

vi.mock("@/barber/components/settings/hooks/useBarberSettingsData", () => ({
  default: () => ({
    allSalonEntries: [],
    availableSalons: [],
    clearSalonReadError: vi.fn(),
    currentUserId: "barber-1",
    eventCertificates: [],
    managedSalons: [],
    ownerRequests: [],
    pendingEntries: [],
    refreshSalonData: vi.fn(async () => {}),
    salonAdmins: {},
    salonDataLoaded: true,
    salonDataLoading: false,
    salonReadError: "",
    salonStaffById: {},
    salonStatus: { salons: [] },
    salons: [],
  }),
}));

vi.mock("@/barber/hooks/useDefaultSalonScheduleSettings", () => ({
  default: () => ({
    salonSchedules: {},
    savingSalonId: null,
    savedSalonId: null,
    errorSalonId: null,
    salonScheduleErrors: {},
    updateSalonSchedule: vi.fn(),
    updateWeeklyDaySchedule: vi.fn(),
    saveDefaultSchedule: vi.fn(),
  }),
}));

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: (...args) => apiGet(...args),
    post: (...args) => apiPost(...args),
    patch: (...args) => apiPatch(...args),
  },
}));

afterEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
});

function ServiceFormModalHarness({ isSaving = false, onClose = vi.fn() }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open service modal
      </button>
      <ServiceFormModal
        showModal={open}
        editingService={null}
        isSaving={isSaving}
        modalError=""
        saveDisabled={isSaving}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onSave={vi.fn()}
      >
        <label>
          Service name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </ServiceFormModal>
    </div>
  );
}

function ConfirmModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open confirm modal
      </button>
      {open && (
        <ConfirmModal
          title="Remove specialist"
          message="This action cannot be undone."
          onClose={() => setOpen(false)}
          onConfirm={vi.fn()}
        />
      )}
    </div>
  );
}

function DetachedTriggerServiceFormHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}>
          Open removable trigger modal
        </button>
      )}
      <ServiceFormModal
        showModal={open}
        editingService={null}
        isSaving={false}
        modalError=""
        saveDisabled={false}
        onClose={() => setOpen(false)}
        onSave={vi.fn()}
      >
        <label>
          Service name
          <input type="text" />
        </label>
      </ServiceFormModal>
    </div>
  );
}

const authState = {
  auth: {
    currentUser: {
      id: "barber-1",
      role: "barber",
      name: "Alex Barber",
    },
    token: "token",
    isAuthenticated: true,
  },
};

function renderBarberSettings() {
  return renderWithProviders(<BarberSettings settingsView="salon" />, {
    preloadedState: authState,
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPromotionsManager() {
  apiGet.mockImplementation((url) => {
    if (url.endsWith("/promotions")) {
      return Promise.resolve({
        data: [
          {
            _id: "promotion-1",
            title: "Summer Special",
            code: "SUMMER20",
            amount: 20,
            maxUses: 10,
            currentUses: 1,
            discountType: "percentage",
            applicableServiceIds: [],
            applicableBarberIds: [],
            active: true,
          },
        ],
      });
    }

    if (url.endsWith("/staff")) {
      return Promise.resolve({
        data: [{ _id: "barber-1", name: "Alex Barber" }],
      });
    }

    if (url.endsWith("/public-booking")) {
      return Promise.resolve({
        data: { services: [{ _id: "service-1", name: "Haircut" }] },
      });
    }

    return Promise.resolve({ data: [] });
  });

  return render(
    <StrictMode>
      <SalonPromotionsManager salonId="salon-1" salonName="Salon One" />
    </StrictMode>
  );
}

describe("salon and service management modal accessibility", () => {
  it("adds service dialog semantics, focus return, overlay close, and saving close guards", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <ServiceFormModalHarness onClose={onClose} />
      </StrictMode>
    );

    const trigger = screen.getByRole("button", { name: "Open service modal" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Add service" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close add service dialog" })
    ).toBeVisible();
    const serviceNameInput = screen.getByRole("textbox", { name: "Service name" });
    expect(serviceNameInput).toHaveFocus();

    await user.type(serviceNameInput, "Cut");
    expect(serviceNameInput).toHaveValue("Cut");
    expect(serviceNameInput).toHaveFocus();

    rerender(
      <StrictMode>
        <ServiceFormModalHarness isSaving onClose={onClose} />
      </StrictMode>
    );
    expect(screen.getByRole("textbox", { name: "Service name" })).toHaveFocus();

    rerender(
      <StrictMode>
        <ServiceFormModalHarness onClose={onClose} />
      </StrictMode>
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Add service" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(document.querySelector(".fixed.inset-0"));
    expect(screen.queryByRole("dialog", { name: "Add service" })).not.toBeInTheDocument();

    render(
      <StrictMode>
        <ServiceFormModalHarness isSaving onClose={onClose} />
      </StrictMode>
    );
    const savingTrigger = screen.getAllByRole("button", { name: "Open service modal" })[1];
    await user.click(savingTrigger);
    const savingBackdrop = document.querySelectorAll(".fixed.inset-0")[0];
    await user.keyboard("{Escape}");
    await user.click(savingBackdrop);
    await user.click(screen.getByRole("button", { name: "Close add service dialog" }));
    expect(screen.getByRole("dialog", { name: "Add service" })).toBeVisible();
  });

  it("adds confirm modal semantics, focus entry, focus return, close button name, and safe detached-trigger cleanup", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ConfirmModalHarness />
        <DetachedTriggerServiceFormHarness />
      </StrictMode>
    );

    const trigger = screen.getByRole("button", { name: "Open confirm modal" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Remove specialist" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close confirmation modal" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Close confirmation modal" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Remove specialist" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Open removable trigger modal" }));
    expect(screen.getByRole("dialog", { name: "Add service" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Add service" })).not.toBeInTheDocument();
  });

  it("labels promotion fields and restores focus after close paths", async () => {
    const user = userEvent.setup();
    renderPromotionsManager();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Promotion" })).toBeInTheDocument()
    );

    const createTrigger = screen.getByRole("button", { name: "Create Promotion" });
    await user.click(createTrigger);

    expect(screen.getByRole("dialog", { name: "Create Promotion" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close create promotion dialog" })
    ).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveFocus();
    [
      "Title",
      "Description (optional)",
      "Discount Type",
      "Amount (դր)",
      "Code (leave empty to auto-generate)",
      "Start Date",
      "End Date",
      "Max Uses",
    ].forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Create Promotion" })).not.toBeInTheDocument();
    expect(createTrigger).toHaveFocus();

    const editTrigger = screen.getByRole("button", { name: "Edit promotion Summer Special" });
    await user.click(editTrigger);
    expect(screen.getByRole("dialog", { name: "Edit Promotion" })).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveFocus();
    await user.click(document.querySelector(".fixed.inset-0"));
    expect(screen.queryByRole("dialog", { name: "Edit Promotion" })).not.toBeInTheDocument();
    expect(editTrigger).toHaveFocus();
  });

  it("adds pay terms dialog semantics, focus entry, close button name, and focus return", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ManagedSalonsSection
          managedSalonStaff={[
            {
              _id: "salon-1",
              name: "Salon One",
              isOwner: true,
              isAdmin: true,
              adminIds: [],
              barbers: [
                {
                  _id: "barber-1",
                  name: "Alex Barber",
                  roleInSalon: "member",
                  relationshipType: "staff",
                  relationshipStatus: "accepted",
                  staffPayment: { type: "none" },
                },
              ],
            },
          ]}
          salonAdmins={{ "salon-1": { owner: null, admins: [] } }}
          ownerRequests={[]}
          currentUserId="owner-1"
          isSalonSaving={false}
          hideJoinRequestDecisions
          onDecideSalonRequest={vi.fn()}
          onOpenDemoteConfirmation={vi.fn()}
          onOpenPromoteConfirmation={vi.fn()}
          onOpenRemoveBarberConfirmation={vi.fn()}
          onSaveRelationshipType={vi.fn()}
          onSaveStaffPayment={vi.fn(async () => false)}
          savingRelationshipKey=""
          savingPaymentKey=""
        />
      </StrictMode>
    );

    const trigger = screen.getByRole("button", { name: "Pay terms" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Pay terms" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    const paymentTypeField = screen.getByLabelText("Payment type");
    expect(paymentTypeField).toHaveFocus();
    [
      "Payment type",
      "Notes",
    ].forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());

    await user.selectOptions(paymentTypeField, "fixed");
    expect(screen.getByLabelText("Payment type")).toHaveFocus();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Period")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Pay terms" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps BarberSettings confirmation close and busy behavior wired through ConfirmModal props", async () => {
    const user = userEvent.setup();
    const leaveDeferred = createDeferred();
    apiPatch.mockImplementation((url) => {
      if (url === "/salons/leave") {
        return leaveDeferred.promise;
      }

      throw new Error(`Unexpected PATCH ${url}`);
    });

    renderBarberSettings();

    await user.click(screen.getByRole("button", { name: "Open leave confirmation" }));
    expect(screen.getByRole("dialog", { name: "Leave Salon One" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Leave Salon One" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open leave confirmation" }));
    await user.click(screen.getByRole("button", { name: "Leave salon" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Leave Salon One" })).toBeVisible();

    await act(async () => {
      leaveDeferred.resolve({ data: { user: { salon: null, salonStatus: "none", workHistory: [] } } });
      await leaveDeferred.promise;
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Leave Salon One" })).not.toBeInTheDocument()
    );
  });
});
