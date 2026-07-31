import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BookingsList from "./BookingsList";
import { renderWithProviders } from "@/test/renderWithProviders";

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: (...args) => apiGet(...args),
    patch: (...args) => apiPatch(...args),
    post: (...args) => apiPost(...args),
    put: (...args) => apiPut(...args),
  },
}));

vi.mock("@/shared/lib/socket", () => ({
  getSocket: () => null,
}));

vi.mock("@/barber/components/bookings/BookingsHeaderFilters", () => ({
  default: ({ onAddBooking }) => (
    <button type="button" onClick={onAddBooking}>
      Open add booking
    </button>
  ),
}));

vi.mock("@/barber/components/bookings/BookingSections", () => ({
  default: () => <div>Booking sections</div>,
}));

vi.mock("@/barber/components/RejectBookingModal", () => ({
  default: () => null,
}));

const BARBER_ID = "barber-1";
const SERVICE_ID = "service-1";

apiGet.mockResolvedValue({ data: [] });
apiPost.mockResolvedValue({
  data: {
    _id: "booking-1",
    barberId: BARBER_ID,
    bookingDate: "2026-07-31",
    time: "10:00",
  },
});

function renderBookingsList(salons) {
  return renderWithProviders(
    <BookingsList
      bookings={[]}
      services={[
        {
          id: SERVICE_ID,
          barberId: BARBER_ID,
          active: true,
          duration: 30,
          name: "Haircut",
        },
      ]}
    />,
    {
      preloadedState: {
        auth: {
          currentUser: {
            id: BARBER_ID,
            role: "barber",
            salons,
          },
          token: "token",
          isAuthenticated: true,
        },
        notifications: [],
      },
    }
  );
}

async function submitManualBooking() {
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Open add booking" }));

  const dialog = await screen.findByRole("dialog", { name: "Add Booking" });
  await user.type(within(dialog).getByLabelText("Client name"), "Taylor");
  await user.selectOptions(within(dialog).getByLabelText("Service"), SERVICE_ID);
  fireEvent.change(within(dialog).getByLabelText("Time"), {
    target: { value: "10:00" },
  });

  await user.click(within(dialog).getByRole("button", { name: "Add Booking" }));

  await waitFor(() => {
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
}

afterEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: [] });
  apiPost.mockResolvedValue({
    data: {
      _id: "booking-1",
      barberId: BARBER_ID,
      bookingDate: "2026-07-31",
      time: "10:00",
    },
  });
});

describe("BookingsList manual booking salon context", () => {
  it("sends salonId when the approved membership stores a raw salon id", async () => {
    renderBookingsList([{ salon: "salon-id", status: "approved" }]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("salon-id");
  });

  it("sends salonId when the approved membership stores a populated salon object", async () => {
    renderBookingsList([
      { salon: { _id: "salon-id", name: "North Studio" }, status: "approved" },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("salon-id");
  });

  it("prefers the primary approved salon when multiple approved memberships exist", async () => {
    renderBookingsList([
      { salon: "fallback-salon", status: "approved" },
      { salon: "primary-salon", status: "approved", isPrimary: true },
      { salon: "ignored-salon", status: "pending", isPrimary: true },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("primary-salon");
  });

  it("does not fall back to an unrelated membership id when no salon id is present", async () => {
    renderBookingsList([
      { _id: "membership-id", id: "membership-id", status: "approved", isPrimary: true },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBeUndefined();
  });
});
