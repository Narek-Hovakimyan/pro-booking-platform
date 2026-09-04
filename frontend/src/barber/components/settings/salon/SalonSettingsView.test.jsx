import { expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import SalonSettingsView from "./SalonSettingsView";

const policySettingsSpy = vi.hoisted(() => vi.fn());

vi.mock("@/barber/components/TeamSettingsSection", () => ({ default: () => null }));
vi.mock("@/barber/components/SalonPromotionsManager", () => ({ default: () => null }));
vi.mock("@/barber/components/settings/SalonSettingsSection", () => ({ default: () => null }));
vi.mock("@/barber/components/settings/JoinRequestDecisions", () => ({ default: () => null }));
vi.mock("@/barber/components/settings/SalonJoinView", () => ({ default: () => null }));
vi.mock("./SalonApplicationPolicySettings", () => ({
  default: (props) => {
    policySettingsSpy(props);
    return <div data-testid="application-policy-settings" />;
  },
}));

const baseProps = {
  allSalonEntries: [],
  availableSalons: [],
  currentUserId: "barber-a",
  error: "",
  isLoading: false,
  isSalonSaving: false,
  managedSalons: [],
  ownerRequests: [],
  pendingEntries: [],
  salonAdmins: {},
  salonDraft: {},
  salonEntriesWithRelationshipActions: [],
  salonError: "",
  salonSaved: false,
  salonStaffById: {},
  salonStatus: { salonStatus: "none" },
  salons: [],
  savingPaymentKey: "",
  savingRelationshipKey: "",
  selectedSalonId: "",
  onCancelSalonRequest: vi.fn(),
  onCreateSalon: vi.fn(),
  onDecideSalonRequest: vi.fn(),
  onOpenDemoteConfirmation: vi.fn(),
  onOpenLeaveConfirmation: vi.fn(),
  onOpenPromoteConfirmation: vi.fn(),
  onOpenRemoveBarberConfirmation: vi.fn(),
  onRequestSalonJoin: vi.fn(),
  onSaveRelationshipType: vi.fn(),
  onSaveStaffPayment: vi.fn(),
  onSelectedSalonChange: vi.fn(),
  onUpdateSalonDraft: vi.fn(),
};

it("wires application settings only from managed salons with their current policy", () => {
  const managedSalons = [{ id: "salon-a", name: "Managed Salon", joinApplicationPolicy: "job_only" }];
  const { getByTestId } = renderWithProviders(
    <SalonSettingsView {...baseProps} managedSalons={managedSalons} />
  );

  expect(getByTestId("application-policy-settings")).toBeVisible();
  expect(policySettingsSpy.mock.calls.at(-1)[0]).toEqual({ salons: managedSalons });
});

it("does not render application settings without managed salons", () => {
  const { queryByTestId } = renderWithProviders(<SalonSettingsView {...baseProps} />);

  expect(queryByTestId("application-policy-settings")).not.toBeInTheDocument();
});
