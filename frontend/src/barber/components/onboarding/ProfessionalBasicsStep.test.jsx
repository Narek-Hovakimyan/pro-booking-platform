import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProfessionalBasicsStep from "./ProfessionalBasicsStep";
import { renderWithProviders } from "@/test/renderWithProviders";
import api from "@/shared/api/axios";
import { getMyBarberOnboarding } from "@/shared/api/barberOnboarding";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

vi.mock("@/shared/api/barberOnboarding", () => ({
  getMyBarberOnboarding: vi.fn(),
}));

const user = {
  id: "barber-1",
  role: "barber",
  name: "Test Barber",
  phone: "+37400111222",
  city: "Yerevan",
  profession: "barber",
  barberType: "unisex",
};

const profile = (overrides = {}) => ({
  ...user,
  bio: "",
  address: "Private address",
  instagram: "",
  imageUrl: "",
  galleryImages: [],
  ...overrides,
});

const onboardingStatus = (workplace, overrides = {}) => ({
  needsOnboarding: true,
  state: { currentStep: "professional_basics", workplace },
  missing: [],
  ...overrides,
});

const renderStep = ({
  loadedProfile = profile(),
  initialStatus = onboardingStatus(null),
  onStatusChange = vi.fn(),
} = {}) => {
  api.get.mockResolvedValue({ data: loadedProfile });
  getMyBarberOnboarding.mockResolvedValue(initialStatus);

  renderWithProviders(<ProfessionalBasicsStep onStatusChange={onStatusChange} />, {
    preloadedState: {
      auth: {
        currentUser: { ...user, city: loadedProfile.city },
        token: "token",
        isAuthenticated: true,
      },
    },
  });

  return { onStatusChange };
};

const saveProfile = async () => {
  const actor = userEvent.setup();
  await actor.click(await screen.findByRole("button", { name: "Save profile" }));
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProfessionalBasicsStep onboarding validation", () => {
  it("reports a missing city without saving", async () => {
    renderStep({ loadedProfile: profile({ city: "", address: "" }) });

    await saveProfile();

    expect(screen.getByText("City is required. Enter your city before saving.")).toBeVisible();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
  });

  it.each(["independent", "both"])(
    "requires an address for %s while professional basics is active",
    async (workplace) => {
      renderStep({
        loadedProfile: profile({ address: "" }),
        initialStatus: onboardingStatus(workplace),
      });

      await saveProfile();

      expect(screen.getByText("Address is required. Enter your address before saving.")).toBeVisible();
      expect(api.put).not.toHaveBeenCalled();
      expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
    }
  );

  it("reports both required fields in the editable professional basics form", async () => {
    renderStep({
      loadedProfile: profile({ city: "", address: "" }),
      initialStatus: onboardingStatus("independent"),
    });

    await saveProfile();

    expect(screen.getByLabelText("City")).toBeVisible();
    expect(screen.getByLabelText("Address")).toBeVisible();
    expect(screen.getByText("City and Address are required. Enter both before saving.")).toBeVisible();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("allows a salon-only barber to save a blank address", async () => {
    const savedProfile = profile({ address: "" });
    const status = onboardingStatus("salon", {
      state: { currentStep: "workplace", workplace: "salon" },
      missing: ["WORKPLACE_REQUIRED"],
    });
    api.put.mockResolvedValue({ data: savedProfile });
    getMyBarberOnboarding
      .mockResolvedValueOnce(onboardingStatus("salon"))
      .mockResolvedValueOnce(status);
    const { onStatusChange } = renderStep({
      loadedProfile: savedProfile,
      initialStatus: onboardingStatus("salon"),
    });

    await saveProfile();

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        "/barbers/profile/barber-1",
        expect.objectContaining({ city: "Yerevan", address: "" })
      );
      expect(onStatusChange).toHaveBeenCalledWith(status);
    });
    expect(screen.getByText("Profile saved.")).toBeVisible();
  });

  it("suppresses success when authoritative status still reports missing fields", async () => {
    const savedProfile = profile();
    const status = onboardingStatus("independent", {
      missing: ["CITY_REQUIRED", "INDEPENDENT_ADDRESS_REQUIRED"],
    });
    api.put.mockResolvedValue({ data: savedProfile });
    getMyBarberOnboarding
      .mockResolvedValueOnce(onboardingStatus("independent"))
      .mockResolvedValueOnce(status);
    const { onStatusChange } = renderStep({
      loadedProfile: savedProfile,
      initialStatus: onboardingStatus("independent"),
    });

    await saveProfile();

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(status);
    });
    expect(screen.getByText("City and Address are required. Enter both before saving.")).toBeVisible();
    expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
  });
});
