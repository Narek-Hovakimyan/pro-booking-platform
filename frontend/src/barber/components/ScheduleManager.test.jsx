import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getArmeniaTodayKey } from "@/shared/utils/dates";
import { renderWithProviders } from "@/test/renderWithProviders";
import ScheduleWeeklyHours from "@/barber/components/schedule/ScheduleWeeklyHours";
import ScheduleManager from "./ScheduleManager";
import {
  filterCurrentNonWorkingDays,
  filterCurrentScheduleOverrides,
  getScheduleManagerViewState,
  getSelectedDateScheduleSavePlan,
} from "@/barber/utils/scheduleManagerHelpers";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  getMyBarberOnboarding: vi.fn(),
}));

vi.mock("@/shared/api/axios", () => ({
  default: { get: mocks.apiGet, put: mocks.apiPut },
}));

vi.mock("@/shared/api/barberOnboarding", () => ({
  getMyBarberOnboarding: mocks.getMyBarberOnboarding,
}));

vi.mock("@/barber/components/ScheduleSkeleton", () => ({
  default: () => <div data-testid="schedule-skeleton">Schedule skeleton</div>,
}));

vi.mock("@/barber/components/schedule/AvailabilityDebugPanel", () => ({
  default: ({ servicesError }) => (
    <div data-testid="availability-debug">{servicesError || "Availability debug"}</div>
  ),
}));

vi.mock("@/barber/components/schedule/PersonalScheduleView", () => ({
  default: ({ currentUserId }) => (
    <div data-testid="personal-schedule">Personal schedule for {currentUserId}</div>
  ),
}));

vi.mock("@/barber/components/schedule/ScheduleSalonDrawer", () => ({
  default: ({ isOpen, salons, onClose, onSelect }) => {
    if (!isOpen) return null;

    return (
      <div role="dialog" aria-label="Select salon schedule">
        <button type="button" onClick={onClose}>
          Close
        </button>
        {salons.map((salon) => {
          const salonId = salon.salon?._id || salon.salon?.id || salon._id || salon.id;
          const name = salon.salon?.name || salon.name || "Salon";

          return (
            <button key={salonId} type="button" onClick={() => onSelect(salonId)}>
              {name}
            </button>
          );
        })}
      </div>
    );
  },
}));

const currentUser = {
  _id: "barber-1",
  name: "Morgan",
};

const salonA = { _id: "salon-a", name: "Aurora Salon", status: "approved" };
const salonB = { _id: "salon-b", name: "Blush Studio", status: "approved" };

function baseSchedule(overrides = {}) {
  return {
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
    weeklySchedule: {
      mon: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      tue: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      wed: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      thu: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      fri: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      sat: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      sun: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    dateSchedules: {},
    ...overrides,
  };
}

function renderPage(schedule = baseSchedule(), preloadedState = {}) {
  return renderWithProviders(<ScheduleManager schedule={schedule} />, {
    preloadedState: {
      auth: {
        currentUser,
        token: "token",
        isAuthenticated: true,
      },
      services: [
        {
          id: "service-1",
          barberId: "barber-1",
          name: "Haircut",
          active: true,
        },
      ],
      ...preloadedState,
    },
  });
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

function salonResponse(schedule) {
  return { data: schedule };
}

function mockSingleSalonScheduleLoad(schedule = baseSchedule()) {
  mocks.apiGet.mockImplementation((url) => {
    if (url === "/salons/me/status") {
      return Promise.resolve({ data: { salons: [salonA] } });
    }
    if (url === "/salons/mine/manageable") {
      return Promise.resolve({ data: { salons: [] } });
    }
    if (url === "/schedules/barber-1/salon-a") {
      return Promise.resolve(salonResponse(schedule));
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

async function startPendingSaveAndUnmount() {
  const saveRequest = deferred();

  mockSingleSalonScheduleLoad();
  mocks.apiPut.mockReturnValueOnce(saveRequest.promise);

  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { unmount } = renderPage();

  expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
  await screen.findByDisplayValue("09:00");
  fireEvent.click(screen.getByRole("button", { name: "Save date override" }));
  unmount();

  return { consoleErrorSpy, saveRequest };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ScheduleManager", () => {
  it("falls back to personal schedule when no salons are available", async () => {
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    mocks.getMyBarberOnboarding.mockResolvedValue({
      state: { currentStep: "personal_schedule" },
    });

    renderPage();

    expect(await screen.findByTestId("personal-schedule")).toHaveTextContent(
      "barber-1"
    );
  });

  it("still loads salon schedule data under StrictMode", async () => {
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(
          salonResponse(
            baseSchedule({
              defaultSchedule: {
                startTime: "11:00",
                endTime: "20:00",
                hasBreak: false,
                breakStart: "",
                breakEnd: "",
              },
            })
          )
        );
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderWithProviders(
      <StrictMode>
        <ScheduleManager schedule={baseSchedule()} />
      </StrictMode>,
      {
        preloadedState: {
          auth: {
            currentUser,
            token: "token",
            isAuthenticated: true,
          },
          services: [
            {
              id: "service-1",
              barberId: "barber-1",
              name: "Haircut",
              active: true,
            },
          ],
        },
      }
    );

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    expect(await screen.findByText("11:00 to 20:00")).toBeInTheDocument();
  });

  it("keeps salon B data when salon A resolves late", async () => {
    const salonBLoad = deferred();
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA, salonB] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(
          salonResponse(
            baseSchedule({
              defaultSchedule: {
                startTime: "08:00",
                endTime: "17:00",
                hasBreak: false,
                breakStart: "",
                breakEnd: "",
              },
            })
          )
        );
      }
      if (url === "/schedules/barber-1/salon-b") {
        return salonBLoad.promise;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage(
      baseSchedule({
        defaultSchedule: {
          startTime: "08:00",
          endTime: "17:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        },
      })
    );

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change salon" }));
    fireEvent.click(screen.getByRole("button", { name: "Blush Studio" }));
    fireEvent.click(screen.getByRole("button", { name: "Change salon" }));
    fireEvent.click(screen.getByRole("button", { name: "Aurora Salon" }));
    salonBLoad.resolve(
      salonResponse(
        baseSchedule({
          defaultSchedule: {
            startTime: "10:00",
            endTime: "19:00",
            hasBreak: false,
            breakStart: "",
            breakEnd: "",
          },
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText("08:00 to 17:00")).toBeInTheDocument();
      expect(screen.queryByText("10:00 to 19:00")).not.toBeInTheDocument();
    });
  });

  it("saves against the selected salon and blocks duplicate saves", async () => {
    const salonSchedule = baseSchedule({
      defaultSchedule: {
        startTime: "10:00",
        endTime: "19:00",
        hasBreak: false,
        breakStart: "",
        breakEnd: "",
      },
    });

    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA, salonB] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(salonResponse(baseSchedule()));
      }
      if (url === "/schedules/barber-1/salon-b") {
        return Promise.resolve(salonResponse(salonSchedule));
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    mocks.apiPut.mockImplementation((url, body) =>
      Promise.resolve({ data: { ...salonSchedule, ...body } })
    );

    renderPage();

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change salon" }));
    fireEvent.click(screen.getByRole("button", { name: "Blush Studio" }));
    await screen.findByDisplayValue("10:00");

    const saveButton = screen.getByRole("button", { name: "Save date override" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1));
    expect(mocks.apiPut).toHaveBeenCalledWith(
      "/schedules/barber-1/salon-b",
      expect.objectContaining({
        barberId: "barber-1",
        defaultSchedule: expect.objectContaining({
          startTime: "10:00",
          endTime: "19:00",
        }),
      })
    );
  });

  it("lets legacy schedules opt into default weekday inheritance", async () => {
    mockSingleSalonScheduleLoad(
      baseSchedule({
        defaultSchedule: {
          startTime: "13:00",
          endTime: "18:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        },
      })
    );
    mocks.apiPut.mockImplementation((url, body) =>
      Promise.resolve({ data: body })
    );

    renderPage();

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Use default hours for weekdays",
      })
    );

    await waitFor(() =>
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/schedules/barber-1/salon-a",
        expect.objectContaining({ explicitWeeklyDays: [] })
      )
    );
  });

  it("keeps draft changes isolated when the salon changes", async () => {
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA, salonB] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(salonResponse(baseSchedule()));
      }
      if (url === "/schedules/barber-1/salon-b") {
        return Promise.resolve(
          salonResponse(
            baseSchedule({
              defaultSchedule: {
                startTime: "10:00",
                endTime: "19:00",
                hasBreak: false,
                breakStart: "",
                breakEnd: "",
              },
            })
          )
        );
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    const startTime = await screen.findByDisplayValue("09:00");
    fireEvent.change(startTime, { target: { value: "08:30" } });
    expect(screen.getByText("Unsaved changes.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change salon" }));
    fireEvent.click(screen.getByRole("button", { name: "Blush Studio" }));
    await screen.findByDisplayValue("10:00");
    expect(screen.queryByText("Unsaved changes.")).not.toBeInTheDocument();
  });

  it("shows break validation before saving a date override", async () => {
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(salonResponse(baseSchedule()));
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    await screen.findByDisplayValue("09:00");
    fireEvent.click(screen.getByText("Add break"));
    fireEvent.change(screen.getByLabelText("Break start time"), {
      target: { value: "12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save date override" }));

    expect(
      await screen.findAllByText(
        "Break start and break end must both be filled or both empty."
      )
    ).toHaveLength(3);
    expect(mocks.apiPut).not.toHaveBeenCalled();
  });

  it("suppresses late save failure updates after unmount", async () => {
    const { consoleErrorSpy, saveRequest } = await startPendingSaveAndUnmount();

    saveRequest.reject({
      response: { data: { message: "late failure" } },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("suppresses late save success updates after unmount", async () => {
    const { consoleErrorSpy, saveRequest } = await startPendingSaveAndUnmount();

    saveRequest.resolve(salonResponse(baseSchedule()));

    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText("Schedule saved successfully!")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schedule-skeleton")).not.toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("clears save loading and shows success while mounted", async () => {
    const saveRequest = deferred();

    mockSingleSalonScheduleLoad();
    mocks.apiPut.mockReturnValueOnce(saveRequest.promise);

    renderPage();

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    await screen.findByDisplayValue("09:00");
    fireEvent.click(screen.getByRole("button", { name: "Save date override" }));

    expect(await screen.findByTestId("schedule-skeleton")).toBeInTheDocument();

    saveRequest.resolve(salonResponse(baseSchedule()));

    expect(
      await screen.findByText("Schedule saved successfully!")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("schedule-skeleton")).not.toBeInTheDocument()
    );
  });

  it("uses Armenia date boundaries when filtering overrides and days off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T20:30:00.000Z"));

    const todayKey = getArmeniaTodayKey();
    const pastKey = "2026-08-03";
    const futureKey = "2026-08-05";

    expect(todayKey).toBe("2026-08-04");

    expect(
      filterCurrentScheduleOverrides(
        {
          [pastKey]: { isWorking: false },
          [futureKey]: { isWorking: true },
        },
        todayKey
      )
    ).toEqual({ [futureKey]: { isWorking: true } });
    expect(
      filterCurrentNonWorkingDays([pastKey, futureKey, futureKey], todayKey)
    ).toEqual([futureKey]);
  });

  it("renders Armenia today and the next seven Armenia dates across midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T20:30:00.000Z"));

    const viewState = getScheduleManagerViewState({
      schedule: baseSchedule({
        scheduleOverrides: {
          "2026-08-03": { isWorking: false },
          "2026-08-04": { isWorking: true, startTime: "10:00", endTime: "16:00" },
        },
      }),
      activePerSalonSchedule: null,
      selectedDate: "2026-08-04",
      draftOverride: { dateKey: "", isWorking: true, startTime: "", endTime: "" },
      validationState: { dateKey: "", message: "" },
      breakToggleState: { dateKey: "", enabled: false },
      activeSalonId: "salon-a",
      isLoading: false,
      isLoadingSalons: false,
      isPerSalonLoading: false,
      perSalonError: "",
      error: "",
    });

    expect(viewState.todayKey).toBe("2026-08-04");
    expect(viewState.dateOptions.map((option) => option.value)).toEqual([
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
    expect(viewState.selectedDateKey).toBe("2026-08-04");
    expect(viewState.dateStatusMap["2026-08-04"].isPast).toBe(false);
    expect(viewState.scheduleOverrides).not.toHaveProperty("2026-08-03");
  });

  it("allows an Armenia-today edit and rejects the prior Armenia date", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-03T20:30:00.000Z"));
    mockSingleSalonScheduleLoad();

    renderPage();

    const dateInput = await screen.findByLabelText("Select a custom date");
    expect(dateInput).toHaveAttribute("min", "2026-08-04");
    expect(dateInput).toHaveValue("2026-08-04");

    fireEvent.change(dateInput, { target: { value: "2026-08-05" } });
    expect(dateInput).toHaveValue("2026-08-05");

    fireEvent.change(dateInput, { target: { value: "2026-08-03" } });
    expect(dateInput).toHaveValue("2026-08-05");

    fireEvent.change(dateInput, { target: { value: "2026-08-04" } });
    expect(dateInput).toHaveValue("2026-08-04");
  });

  it("keeps weekly schedule defaults intact when explicit working is false or missing", () => {
    const { rerender } = render(
      <ScheduleWeeklyHours
        defaultSchedule={{
          working: false,
          startTime: "09:00",
          endTime: "18:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        }}
        weeklySchedule={{}}
      />
    );

    expect(screen.getByText("Off by default")).toBeInTheDocument();
    expect(screen.queryByText("09:00 to 18:00")).not.toBeInTheDocument();

    rerender(
      <ScheduleWeeklyHours
        defaultSchedule={{
          working: true,
          startTime: "09:00",
          endTime: "18:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        }}
        weeklySchedule={{}}
      />
    );

    expect(screen.getByText("Open by default")).toBeInTheDocument();
    expect(screen.getAllByText("09:00 to 18:00").length).toBeGreaterThan(0);
  });

  it("shows generated weekday values as inherited default hours", () => {
    render(
      <ScheduleWeeklyHours
        defaultSchedule={{
          working: true,
          startTime: "13:00",
          endTime: "18:00",
          hasBreak: false,
        }}
        weeklySchedule={baseSchedule().weeklySchedule}
        explicitWeeklyDays={[]}
      />
    );

    expect(screen.getAllByText("13:00 to 18:00")).toHaveLength(8);
    expect(screen.queryByText("09:00 to 18:00")).not.toBeInTheDocument();
  });

  it("propagates services diagnostics into the schedule view", async () => {
    mocks.apiGet.mockImplementation((url) => {
      if (url === "/salons/me/status") {
        return Promise.resolve({ data: { salons: [salonA] } });
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/schedules/barber-1/salon-a") {
        return Promise.resolve(salonResponse(baseSchedule()));
      }
      if (url === "/services/barber-1") {
        return Promise.reject({
          response: { data: { message: "Could not load services." } },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage(baseSchedule(), { services: [] });

    expect(await screen.findByText("Aurora Salon")).toBeInTheDocument();
    expect(await screen.findByTestId("availability-debug")).toHaveTextContent(
      "Could not load services."
    );
  });

  it("builds the selected-date save plan without widening the payload", () => {
    const plan = getSelectedDateScheduleSavePlan({
      activeDraft: {
        isWorking: true,
        startTime: "10:00",
        endTime: "18:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      },
      selectedDateKey: "2026-08-06",
      scheduleOverrides: {
        "2026-08-05": { isWorking: false },
      },
      nonWorkingDays: ["2026-08-05"],
      isNonWorkingDay: false,
    });

    expect(plan).toEqual({
      updates: {
        scheduleOverrides: {
          "2026-08-05": { isWorking: false },
          "2026-08-06": {
            isWorking: true,
            startTime: "10:00",
            endTime: "18:00",
            breakStart: "12:00",
            breakEnd: "13:00",
          },
        },
        nonWorkingDays: ["2026-08-05"],
      },
    });
  });
});
