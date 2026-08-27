import { forwardRef, useImperativeHandle } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "../api/axios";
import { useBarberData, getLoadedWeeklySchedule, getUnambiguousSalonId } from "./useBarberData";
import scheduleReducer from "../../store/slices/scheduleSlice";

vi.mock("../api/axios", () => ({
  default: { get: vi.fn() },
}));

const Harness = forwardRef((props, ref) => {
  const value = useBarberData(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

const baseProps = (overrides = {}) => ({
  currentUser: { id: "barber-1", role: "barber" },
  currentUserId: "barber-1",
  currentUserRole: "barber",
  dispatch: vi.fn(),
  bookings: [],
  services: [],
  schedule: {},
  setDataError: vi.fn(),
  ...overrides,
});

describe("useBarberData schedule loading", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.get.mockImplementation((path) => {
      if (path.startsWith("/services/")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { schedule: {} } });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps sparse inherited weekdays and an explicit empty provenance list", async () => {
    const dispatch = vi.fn();
    api.get.mockImplementation((path) => {
      if (path.startsWith("/services/")) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: {
          schedule: {
            weeklySchedule: { mon: { working: true, from: "09:00", to: "18:00" } },
            explicitWeeklyDays: [],
            defaultSchedule: {
              startTime: "18:00",
              endTime: "20:00",
              hasBreak: false,
              breakStart: "",
              breakEnd: "",
            },
          },
        },
      });
    });
    const ref = { current: null };

    render(<Harness ref={ref} {...baseProps({ dispatch })} />);

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    const scheduleAction = dispatch.mock.calls[1][0];
    expect(scheduleAction.payload.weeklySchedule).toEqual({
      mon: { working: true, from: "09:00", to: "18:00" },
    });
    expect(scheduleAction.payload.explicitWeeklyDays).toEqual([]);
    expect(scheduleAction.payload.defaultSchedule.startTime).toBe("18:00");
    const reduxState = scheduleReducer({}, scheduleAction);
    expect(reduxState["barber-1"].explicitWeeklyDays).toEqual([]);
    expect(reduxState["barber-1"].weeklySchedule).toEqual({});
    expect(getLoadedWeeklySchedule({}).mon).toBeUndefined();
  });

  it("uses one unambiguous approved salon schedule and never guesses among multiple salons", async () => {
    expect(
      getUnambiguousSalonId({
        salons: [
          { salon: "salon-1", status: "approved", isPrimary: true },
          { salon: "salon-2", status: "approved" },
        ],
      })
    ).toBe("salon-1");
    expect(
      getUnambiguousSalonId({
        salons: [
          { salon: "salon-1", status: "approved" },
          { salon: "salon-2", status: "approved" },
        ],
      })
    ).toBeNull();

    render(
      <Harness
        {...baseProps({
          currentUser: {
            id: "barber-1",
            role: "barber",
            salons: [{ salon: "salon-1", status: "approved", isPrimary: true }],
          },
        })}
      />
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/schedules/barber-1/salon-1")
    );
  });

  it("does not let a legacy approval override a canonical same-salon pending entry", () => {
    expect(
      getUnambiguousSalonId({
        salon: "salon-1",
        salonStatus: "approved",
        salons: [{ salon: "salon-1", status: "pending" }],
      })
    ).toBeNull();
    expect(
      getUnambiguousSalonId({
        salon: "salon-1",
        salonStatus: "approved",
        salons: [{ salon: "salon-2", status: "pending" }],
      })
    ).toBe("salon-1");
  });

  it("uses the personal endpoint when multiple approved salons have no context", async () => {
    render(
      <Harness
        {...baseProps({
          currentUser: {
            id: "barber-1",
            role: "barber",
            salons: [
              { salon: "salon-1", status: "approved" },
              { salon: "salon-2", status: "approved" },
            ],
          },
        })}
      />
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/schedules/barber-1/personal")
    );
    expect(api.get).not.toHaveBeenCalledWith("/schedules/barber-1/salon-1");
  });

  it("preserves legacy personal schedules when no salon context is available", async () => {
    render(<Harness {...baseProps()} />);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/schedules/barber-1/personal")
    );
  });
});
