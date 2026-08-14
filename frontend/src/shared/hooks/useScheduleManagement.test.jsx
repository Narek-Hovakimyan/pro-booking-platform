import { forwardRef, useImperativeHandle } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScheduleManagement } from "./useScheduleManagement";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("../api/axios", () => ({
  default: {
    get: mocks.get,
    put: mocks.put,
  },
}));

const baseSchedule = () => ({
  weeklySchedule: {
    mon: { working: true, from: "09:00", to: "18:00" },
    tue: { working: true, from: "09:00", to: "18:00" },
  },
  dateSchedules: {},
  scheduleOverrides: {},
  defaultSchedule: { from: "09:00", to: "18:00" },
  nonWorkingDays: [],
});

const response = (schedule) => ({ data: schedule });

const Harness = forwardRef((props, ref) => {
  const actions = useScheduleManagement(props);
  useImperativeHandle(ref, () => actions, [actions]);
  return null;
});

function renderHookHarness(overrides = {}) {
  const ref = { current: null };
  const dispatch = vi.fn();
  const setDataError = vi.fn();
  const schedule = baseSchedule();
  const view = render(
    <Harness
      ref={ref}
      currentUserId="barber-1"
      dispatch={dispatch}
      barberSchedule={schedule.weeklySchedule}
      barberDateSchedules={schedule.dateSchedules}
      barberScheduleOverrides={schedule.scheduleOverrides}
      barberDefaultSchedule={schedule.defaultSchedule}
      barberNonWorkingDays={schedule.nonWorkingDays}
      setDataError={setDataError}
      {...overrides}
    />
  );
  return { ref, dispatch, setDataError, ...view };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useScheduleManagement", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes updates and builds the second payload from the first response", async () => {
    const first = deferred();
    const second = deferred();
    const firstResult = baseSchedule();
    firstResult.weeklySchedule.mon.from = "10:00";
    const secondResult = baseSchedule();
    secondResult.weeklySchedule.mon.from = "10:00";
    secondResult.weeklySchedule.tue.from = "11:00";
    mocks.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { ref } = renderHookHarness();

    let firstMutation;
    let secondMutation;
    await act(async () => {
      firstMutation = ref.current.updateSchedule("mon", "from", "10:00");
      secondMutation = ref.current.updateSchedule("tue", "from", "11:00");
      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    });

    expect(mocks.put.mock.calls[0][1].weeklySchedule.tue.from).toBe("09:00");
    first.resolve(response(firstResult));
    await act(async () => {
      await firstMutation;
      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    });
    expect(mocks.put.mock.calls[1][1].weeklySchedule.mon.from).toBe("10:00");
    expect(mocks.put.mock.calls[1][1].weeklySchedule.tue.from).toBe("11:00");

    second.resolve(response(secondResult));
    await act(async () => {
      await secondMutation;
    });
  });

  it("rebases after a failed mutation without losing a later queued intent", async () => {
    const first = deferred();
    const second = deferred();
    const authoritative = baseSchedule();
    authoritative.weeklySchedule.mon.from = "09:30";
    const final = baseSchedule();
    final.weeklySchedule.mon.from = "09:30";
    final.weeklySchedule.tue.from = "11:00";
    mocks.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mocks.get.mockResolvedValueOnce(response(authoritative));
    const { ref, dispatch } = renderHookHarness();

    const firstMutation = ref.current.updateSchedule("mon", "from", "10:00");
    const secondMutation = ref.current.updateSchedule("tue", "from", "11:00");
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(dispatch).not.toHaveBeenCalled();
    first.reject(new Error("temporary failure"));
    await act(async () => {
      await firstMutation;
      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    });

    expect(mocks.get).toHaveBeenCalledWith("/schedules/barber-1");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.calls[1][1].weeklySchedule.mon.from).toBe("09:30");
    expect(mocks.put.mock.calls[1][1].weeklySchedule.tue.from).toBe("11:00");
    second.resolve(response(final));
    await act(async () => {
      await secondMutation;
    });
    expect(dispatch).toHaveBeenCalled();
  });

  it("serializes day-off and override mutations from the confirmed state", async () => {
    const first = deferred();
    const second = deferred();
    const firstResult = baseSchedule();
    firstResult.nonWorkingDays = ["2026-08-20"];
    const secondResult = baseSchedule();
    secondResult.nonWorkingDays = ["2026-08-20"];
    secondResult.scheduleOverrides = {
      "2026-08-21": { isWorking: false },
    };
    mocks.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { ref } = renderHookHarness();

    const firstMutation = ref.current.updateNonWorkingDay("2026-08-20", true);
    const secondMutation = ref.current.updateScheduleOverride("2026-08-21", {
      isWorking: false,
    });
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    first.resolve(response(firstResult));
    await act(async () => {
      await firstMutation;
      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    });
    expect(mocks.put.mock.calls[1][1].nonWorkingDays).toEqual([
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(mocks.put.mock.calls[1][1].scheduleOverrides).toEqual({
      "2026-08-21": { isWorking: false },
    });
    second.resolve(response(secondResult));
    await act(async () => {
      await secondMutation;
    });
  });

  it("does not dispatch or report late completion after unmount", async () => {
    const pending = deferred();
    mocks.put.mockReturnValueOnce(pending.promise);
    const { ref, dispatch, setDataError, unmount } = renderHookHarness();
    const mutation = ref.current.updateSchedule("mon", "from", "10:00");
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    unmount();
    pending.resolve(response(baseSchedule()));
    await act(async () => {
      await mutation;
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(setDataError).toHaveBeenCalledTimes(1);
  });

  it("removes an override without rebuilding from stale closure state", async () => {
    const schedule = baseSchedule();
    schedule.scheduleOverrides["2026-08-21"] = { isWorking: false };
    schedule.nonWorkingDays = ["2026-08-21"];
    const result = baseSchedule();
    mocks.put.mockResolvedValueOnce(response(result));
    const { ref } = renderHookHarness({
      barberScheduleOverrides: schedule.scheduleOverrides,
      barberNonWorkingDays: schedule.nonWorkingDays,
    });

    await act(async () => {
      await ref.current.updateScheduleOverride("2026-08-21", null);
    });

    expect(mocks.put.mock.calls[0][1].scheduleOverrides).toEqual({});
    expect(mocks.put.mock.calls[0][1].nonWorkingDays).toEqual(["2026-08-21"]);
  });

  it("keeps a successful single mutation compatible with the existing response shape", async () => {
    const schedule = baseSchedule();
    schedule.weeklySchedule.mon.from = "10:00";
    mocks.put.mockResolvedValueOnce(response(schedule));
    const { ref, dispatch, setDataError } = renderHookHarness();

    await act(async () => {
      await ref.current.updateSchedule("mon", "from", "10:00");
    });

    expect(mocks.put).toHaveBeenCalledWith(
      "/schedules",
      expect.objectContaining({
        barberId: "barber-1",
        weeklySchedule: expect.objectContaining({
          mon: expect.objectContaining({ from: "10:00" }),
        }),
      })
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(setDataError).toHaveBeenLastCalledWith("");
  });
});
