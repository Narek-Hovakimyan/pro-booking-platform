import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventsPage from "./EventsPage";
import { isEventEnded } from "@/features/events/utils/eventFormatters";
import { renderWithProviders } from "@/test/renderWithProviders";
import api from "@/shared/api/axios";
import Notifications from "@/shared/components/Notifications";

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedApi = api;

const currentUser = {
  _id: "barber-1",
  id: "barber-1",
  role: "barber",
  name: "Barber One",
};

const salonOne = { _id: "salon-1", name: "Salon One", address: "Yerevan, One" };
const salonTwo = { _id: "salon-2", name: "Salon Two", address: "Yerevan, Two" };

function resolveApiResponses({
  events = [],
  salons = [salonOne, salonTwo],
  manageableSalons = [],
  myRegistrations = [],
  eventDetails = {},
  eventRegistrations = {},
  post = {},
  patch = {},
  del = {},
  put = {},
} = {}) {
  mockedApi.get.mockImplementation(async (url) => {
    if (url.startsWith("/events?")) return { data: events };
    if (url === "/salons") return { data: salons };
    if (url === "/salons/mine/manageable") return { data: manageableSalons };
    if (url === "/events/my-registrations") return { data: myRegistrations };
    if (url.endsWith("/registrations")) {
      const eventId = url.split("/")[2];
      return { data: eventRegistrations[eventId] || [] };
    }
    if (url.startsWith("/events/")) {
      const eventId = url.split("/")[2];
      return { data: eventDetails[eventId] || events.find((event) => event._id === eventId) };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  mockedApi.post.mockImplementation(async (url, body) => {
    if (post[url]) return post[url](body);
    throw new Error(`Unexpected POST ${url}`);
  });

  mockedApi.patch.mockImplementation(async (url, body) => {
    if (patch[url]) return patch[url](body);
    throw new Error(`Unexpected PATCH ${url}`);
  });

  mockedApi.delete.mockImplementation(async (url) => {
    if (del[url]) return del[url]();
    throw new Error(`Unexpected DELETE ${url}`);
  });

  mockedApi.put.mockImplementation(async (url, body) => {
    if (put[url]) return put[url](body);
    throw new Error(`Unexpected PUT ${url}`);
  });
}

function renderPage(preloadedState = {}) {
  return renderWithProviders(<EventsPage />, {
    initialEntries: ["/events"],
    preloadedState: {
      auth: { currentUser, token: "token", isAuthenticated: true },
      ...preloadedState,
    },
  });
}

function renderPageWithNotifications(preloadedState = {}) {
  return renderWithProviders(
    <>
      <EventsPage />
      <Notifications />
    </>,
    {
      initialEntries: ["/events"],
      preloadedState: {
        auth: { currentUser, token: "token", isAuthenticated: true },
        ...preloadedState,
      },
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EventsPage", () => {
  it("keeps organizer registration disabled, preserves approved cancellation rules, and hides expired register actions", async () => {
    resolveApiResponses({
      events: [
        {
          _id: "event-organizer",
          title: "Organizer Event",
          organizerId: currentUser._id,
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
        },
        {
          _id: "event-approved",
          title: "Approved Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "10:00",
          duration: 60,
          registrationCount: 1,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon Two",
        },
        {
          _id: "event-expired",
          title: "Expired Event",
          organizerId: "barber-3",
          date: "2026-08-05",
          time: "10:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon Two",
        },
      ],
      myRegistrations: [
        { eventId: "event-approved", status: "approved" },
        { eventId: "event-organizer", status: "pending" },
      ],
    });

    renderPage();

    await screen.findByText("Organizer Event");
    expect(screen.getByRole("button", { name: "You are the organizer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approved" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("keeps salon-scoped create access and strips stale salon ids when switching locations", async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn(async () => ({ data: { _id: "new-event" } }));

    resolveApiResponses({
      events: [],
      manageableSalons: [salonOne, salonTwo],
      post: {
        "/events": postSpy,
      },
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Create Event" }));
    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "Workshop" },
    });
    fireEvent.change(screen.getByLabelText("Instructor *"), {
      target: { value: "Instructor" },
    });
    fireEvent.change(screen.getByLabelText("Date *"), {
      target: { value: "2026-08-10" },
    });
    fireEvent.change(screen.getByLabelText("Time * (HH:mm)"), {
      target: { value: "09:30" },
    });
    fireEvent.change(screen.getByLabelText("Duration (min) *"), {
      target: { value: "60" },
    });

    await user.click(screen.getByRole("button", { name: /At my salon/i }));
    await user.selectOptions(screen.getByLabelText("Salon *"), "salon-1");
    await user.click(screen.getByRole("button", { name: /Other location/i }));
    await user.type(screen.getByLabelText("Venue / Location *"), "Yerevan Expo");

    await user.click(
      within(screen.getByRole("dialog", { name: "Create Event" })).getByRole(
        "button",
        { name: "Create Event" }
      )
    );

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    const payload = postSpy.mock.calls[0][0];
    expect(payload.locationType).toBe("other");
    expect(payload.salonId).toBe("");
    expect(payload.location).toBe("Yerevan Expo");

    await user.click(await screen.findByRole("button", { name: "Create Event" }));
    expect(screen.getByLabelText("Title *")).toHaveValue("");
  });

  it("keeps verification codes out of organizer-facing certificate UI and blocks duplicate approvals", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.fn(async () => ({
      data: { message: "Registration approved", registrationCount: 2 },
    }));

    resolveApiResponses({
      events: [
        {
          _id: "event-1",
          title: "Manager Event",
          organizerId: "barber-2",
          salonId: salonOne,
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 1,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          certificatesEnabled: true,
        },
      ],
      manageableSalons: [salonOne],
      eventDetails: {
        "event-1": {
          _id: "event-1",
          title: "Manager Event",
          organizerId: "barber-2",
          salonId: salonOne,
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 1,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          certificatesEnabled: true,
          status: "upcoming",
          reviews: [],
        },
      },
      eventRegistrations: {
        "event-1": [
          {
            _id: "reg-pending",
            status: "pending",
            userName: "Pending Barber",
            barberId: "barber-2",
          },
          {
            _id: "reg-approved",
            status: "approved",
            attended: true,
            userName: "Approved Barber",
            barberId: "barber-3",
            certificate: {
              certificateId: "cert-1",
              verificationCode: "SECRET-CODE",
              status: "issued",
            },
          },
        ],
      },
      patch: {
        "/events/event-1/registrations/reg-pending/approve": patchSpy,
      },
    });

    renderPage();

    await user.click(await screen.findByText("Manager Event"));
    await screen.findByText("Registration Requests");
    expect(screen.getByText("cert-1")).toBeInTheDocument();
    expect(screen.queryByText("SECRET-CODE")).not.toBeInTheDocument();

    const approveButton = screen.getAllByRole("button", { name: "Approve" })[0];
    await user.dblClick(approveButton);
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
  });

  it("routes failed card registrations to the page-level notification layer and keeps modal state clear", async () => {
    const user = userEvent.setup();
    const error = new Error("Registration closed");
    const registrationFailure = vi.fn(async () => {
      throw error;
    });

    resolveApiResponses({
      events: [
        {
          _id: "event-1",
          title: "Open Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          salonId: salonOne,
          status: "upcoming",
        },
      ],
      manageableSalons: [salonOne],
      eventDetails: {
        "event-1": {
          _id: "event-1",
          title: "Open Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          salonId: salonOne,
          status: "upcoming",
          reviews: [],
        },
      },
      post: {
        "/events/event-1/register": registrationFailure,
      },
    });

    const { store } = renderPageWithNotifications();

    await user.click(await screen.findByRole("button", { name: "Register" }));

    expect(await screen.findByText("Registration closed")).toBeInTheDocument();
    expect(store.getState().notifications).toHaveLength(1);
    expect(store.getState().notifications[0].message).toBe("Registration closed");
  });

  it("keeps modal-driven registration failures inside the active modal without creating a global notification", async () => {
    const user = userEvent.setup();
    const registrationFailure = vi.fn(async () => {
      throw new Error("Registration closed");
    });

    resolveApiResponses({
      events: [
        {
          _id: "event-1",
          title: "Open Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          salonId: salonOne,
          status: "upcoming",
        },
      ],
      manageableSalons: [salonOne],
      eventDetails: {
        "event-1": {
          _id: "event-1",
          title: "Open Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
          salonId: salonOne,
          status: "upcoming",
          reviews: [],
        },
      },
      post: {
        "/events/event-1/register": registrationFailure,
      },
    });

    const { store } = renderPageWithNotifications();

    await user.click(await screen.findByText("Open Event"));
    await screen.findByText("Registration Requests");
    await user.click(screen.getByRole("button", { name: "Register Now" }));

    await screen.findByText("Registration closed");
    expect(store.getState().notifications).toHaveLength(0);
    expect(screen.getAllByText("Registration closed")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Register Now" })).toBeEnabled();
    expect(registrationFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps successful registrations on the existing success path", async () => {
    const user = userEvent.setup();
    let registrations = [];

    mockedApi.get.mockImplementation(async (url) => {
      if (url.startsWith("/events?")) {
        return {
          data: [
            {
              _id: "event-1",
              title: "Registerable Event",
              organizerId: "barber-2",
              date: "2026-08-10",
              time: "09:00",
              duration: 60,
              registrationCount: 0,
              maxParticipants: 20,
              price: 0,
              instructor: "Instructor",
              location: "Salon One",
            },
          ],
        };
      }
      if (url === "/salons") return { data: [salonOne] };
      if (url === "/salons/mine/manageable") return { data: [] };
      if (url === "/events/my-registrations") return { data: registrations };
      if (url === "/events/event-1") {
        return {
          data: {
            _id: "event-1",
            title: "Registerable Event",
            organizerId: "barber-2",
            date: "2026-08-10",
            time: "09:00",
            duration: 60,
            registrationCount: 1,
            maxParticipants: 20,
            price: 0,
            instructor: "Instructor",
            location: "Salon One",
            status: "upcoming",
            reviews: [],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    mockedApi.post.mockImplementation(async (url) => {
      if (url === "/events/event-1/register") {
        registrations = [{ eventId: "event-1", status: "pending" }];
        return { data: { registrationCount: 1 } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel Request" })).toBeInTheDocument()
    );
    expect(screen.queryByText("Registration closed")).not.toBeInTheDocument();
  });

  it("suppresses late registration updates after unmount", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = deferred();

    resolveApiResponses({
      events: [
        {
          _id: "event-1",
          title: "Registerable Event",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
        },
      ],
      post: {
        "/events/event-1/register": async () => pending.promise,
      },
    });

    const view = renderPage();
    await user.click(await screen.findByRole("button", { name: "Register" }));
    view.unmount();
    pending.resolve({ data: { registrationCount: 1 } });
    await waitFor(() => expect(consoleError).not.toHaveBeenCalled());
    consoleError.mockRestore();
  });

  it("suppresses stale detail responses and preserves final-unmount safety", async () => {
    const user = userEvent.setup();
    const firstDetail = deferred();
    const secondDetail = deferred();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    resolveApiResponses({
      events: [
        {
          _id: "event-1",
          title: "First Detail",
          organizerId: "barber-2",
          date: "2026-08-10",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon One",
        },
        {
          _id: "event-2",
          title: "Second Detail",
          organizerId: "barber-2",
          date: "2026-08-11",
          time: "09:00",
          duration: 60,
          registrationCount: 0,
          maxParticipants: 20,
          price: 0,
          instructor: "Instructor",
          location: "Salon Two",
        },
      ],
      post: {},
    });

    mockedApi.get.mockImplementation(async (url) => {
      if (url.startsWith("/events?")) {
        return {
          data: [
            {
              _id: "event-1",
              title: "First Detail",
              organizerId: "barber-2",
              date: "2026-08-10",
              time: "09:00",
              duration: 60,
              registrationCount: 0,
              maxParticipants: 20,
              price: 0,
              instructor: "Instructor",
              location: "Salon One",
            },
            {
              _id: "event-2",
              title: "Second Detail",
              organizerId: "barber-2",
              date: "2026-08-11",
              time: "09:00",
              duration: 60,
              registrationCount: 0,
              maxParticipants: 20,
              price: 0,
              instructor: "Instructor",
              location: "Salon Two",
            },
          ],
        };
      }
      if (url === "/salons") return { data: [salonOne, salonTwo] };
      if (url === "/salons/mine/manageable") return { data: [] };
      if (url === "/events/my-registrations") return { data: [] };
      if (url === "/events/event-1") return firstDetail.promise;
      if (url === "/events/event-2") return secondDetail.promise;
      if (url.endsWith("/registrations")) return { data: [] };
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    await user.click(await screen.findByText("First Detail"));
    await user.click(screen.getByText("Second Detail"));

    secondDetail.resolve({
      data: {
        _id: "event-2",
        title: "Second Detail",
        description: "Second description",
        organizerId: "barber-2",
        date: "2026-08-11",
        time: "09:00",
        duration: 60,
        registrationCount: 0,
        maxParticipants: 20,
        price: 0,
        instructor: "Instructor",
        location: "Salon Two",
        status: "upcoming",
        reviews: [],
      },
    });
    firstDetail.resolve({
      data: {
        _id: "event-1",
        title: "First Detail",
        description: "First description",
        organizerId: "barber-2",
        date: "2026-08-10",
        time: "09:00",
        duration: 60,
        registrationCount: 0,
        maxParticipants: 20,
        price: 0,
        instructor: "Instructor",
        location: "Salon One",
        status: "upcoming",
        reviews: [],
      },
    });

    await screen.findByText("Second description");
    expect(screen.getByText("Second description")).toBeInTheDocument();
    expect(screen.queryByText("First description")).not.toBeInTheDocument();

    const pending = deferred();
    mockedApi.get.mockImplementation(async (url) => {
      if (url.startsWith("/events?")) return pending.promise;
      if (url === "/salons") return pending.promise;
      if (url === "/salons/mine/manageable") return pending.promise;
      if (url === "/events/my-registrations") return pending.promise;
      return pending.promise;
    });
    const unmountView = renderPage();
    unmountView.unmount();
    pending.resolve({ data: [] });
    await waitFor(() => expect(consoleError).not.toHaveBeenCalled());
    consoleError.mockRestore();
  });

  it("preserves Armenia date-boundary behavior for event ending checks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00+04:00"));

    expect(
      isEventEnded({
        date: "2026-08-06",
        time: "11:00",
        duration: 30,
      })
    ).toBe(true);
    expect(
      isEventEnded({
        date: "2026-08-06",
        time: "12:30",
        duration: 30,
      })
    ).toBe(false);
  });
});

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}
