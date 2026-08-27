import { act, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
}));

import api from "@/shared/api/axios";
import BookingPage from "./BookingPage";

vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector) => selector({ users: [{ id: "barber-1", role: "barber" }] }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn() },
}));

const renderPage = (state, props = {}) => {
  const bookingProps = {
    step: 2,
    setStep: vi.fn(),
    services: [],
    selectedServiceId: null,
    setSelectedServiceId: vi.fn(),
    selectedDayKey: "",
    setSelectedDayKey: vi.fn(),
    selectedTime: "",
    setSelectedTime: vi.fn(),
    client: { name: "", phone: "", note: "" },
    currentUser: { id: "client-1" },
    bookings: [],
    schedule: {},
    setClient: vi.fn(),
    ...props,
  };

  render(
    <MemoryRouter initialEntries={[{ pathname: "/booking/barber-1", search: "?salonId=salon-7", state }]}>
      <Routes><Route path="/booking/:barberId" element={<BookingPage {...bookingProps} />} /></Routes>
    </MemoryRouter>
  );
  return bookingProps;
};

describe("BookingPage route and reset behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.dispatch.mockClear();
    mocks.navigate.mockClear();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps salon query context while cleaning rebook state and resets into the rebook step", () => {
    const props = renderPage({
      rebook: true,
      barber: { id: "barber-1", depositSettings: { enabled: false } },
      barberId: "barber-1",
      serviceId: "service-1",
      selectedSalonId: "salon-7",
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: "/booking/barber-1", search: "?salonId=salon-7" },
      expect.objectContaining({ replace: true, state: { barber: { id: "barber-1", depositSettings: { enabled: false } } } })
    );
    act(() => vi.runOnlyPendingTimers());
    expect(props.setStep).toHaveBeenCalledWith(3);
    expect(props.setSelectedServiceId).toHaveBeenCalledWith("service-1");
  });

  it("resets a standard booking flow to service selection", () => {
    const props = renderPage({ barber: { id: "barber-1", depositSettings: { enabled: false } } });

    act(() => vi.runOnlyPendingTimers());
    expect(props.setStep).toHaveBeenCalledWith(2);
    expect(props.setSelectedServiceId).toHaveBeenCalledWith(null);
    expect(props.setSelectedTime).toHaveBeenCalledWith("");
    expect(props.setClient).toHaveBeenCalledWith({ name: "", phone: "", note: "" });
  });
});
