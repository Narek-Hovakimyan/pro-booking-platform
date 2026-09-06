import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Header from "./Header";
import { restoreAuthSession } from "@/store/slices/authSlice";
import { renderWithProviders } from "@/test/renderWithProviders";

const apiGetMock = vi.hoisted(() => vi.fn());
const getSocketMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/axios", () => ({
  default: { get: apiGetMock },
}));

vi.mock("@/shared/lib/socket", () => ({
  getSocket: getSocketMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en", changeLanguage: vi.fn() },
    t: (key) => key,
  }),
}));

vi.mock("@/shared/auth/performLogout", () => ({
  performLogout: vi.fn(),
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
};

const response = (data) => ({ data });
const unreadMessages = (userId, count) =>
  Array.from({ length: count }, () => ({ receiverId: userId, isRead: false }));
const unreadNotifications = (count) =>
  Array.from({ length: count }, () => ({ isRead: false }));
const barberAuth = (id) => ({
  currentUser: { id, role: "barber", name: `Barber ${id}` },
  isAuthenticated: true,
  token: `token-${id}`,
});

function createSocket() {
  const listeners = new Map();

  return {
    off: vi.fn((event) => listeners.delete(event)),
    on: vi.fn((event, listener) => listeners.set(event, listener)),
    emit(event, payload) {
      listeners.get(event)?.(payload);
    },
  };
}

function queueRequests(requests) {
  apiGetMock.mockImplementation((url) => {
    const request = requests[url]?.shift();
    if (request) return request.promise;
    return Promise.resolve(response([]));
  });
}

const getBadge = (label, count) =>
  within(screen.getByRole("link", { name: label })).queryByText(String(count));

beforeEach(() => {
  apiGetMock.mockReset();
  getSocketMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Header authenticated async state", () => {
  test("clears prior-user presentation and ignores superseded responses after an identity switch", async () => {
    const aMessages = deferred();
    const aNotifications = deferred();
    const aSalon = deferred();
    const aStaleSuccess = deferred();
    const aStaleError = deferred();
    const bMessages = deferred();
    const bNotifications = deferred();
    const bSalon = deferred();
    const socket = createSocket();

    getSocketMock.mockReturnValue(socket);
    queueRequests({
      "/messages": [aMessages, bMessages],
      "/notifications": [aNotifications, aStaleSuccess, aStaleError, bNotifications],
      "/salons/mine/manageable": [aSalon, bSalon],
    });

    const { store } = renderWithProviders(<Header />, {
      initialEntries: ["/admin/services"],
      preloadedState: { auth: barberAuth("user-a") },
    });

    await act(async () => {
      aMessages.resolve(response(unreadMessages("user-a", 2)));
      aNotifications.resolve(response(unreadNotifications(3)));
      aSalon.resolve(response([{ ownerId: "user-a" }]));
    });

    await waitFor(() => {
      expect(getBadge("nav.messages", 2)).toBeInTheDocument();
      expect(getBadge("nav.notifications", 3)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "nav.more" }));
    expect(screen.getByRole("button", { name: "nav.salon" })).toBeInTheDocument();

    window.dispatchEvent(new Event("notifications:updated"));
    window.dispatchEvent(new Event("notifications:updated"));
    await act(async () => {
      store.dispatch(
        restoreAuthSession({ token: "token-user-b", user: barberAuth("user-b").currentUser })
      );
    });

    expect(getBadge("nav.messages", 2)).not.toBeInTheDocument();
    expect(getBadge("nav.notifications", 3)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "nav.salon" })).not.toBeInTheDocument();

    await act(async () => {
      bMessages.resolve(response(unreadMessages("user-b", 1)));
      bNotifications.resolve(response(unreadNotifications(1)));
      bSalon.resolve(response([]));
    });

    await waitFor(() => {
      expect(getBadge("nav.messages", 1)).toBeInTheDocument();
      expect(getBadge("nav.notifications", 1)).toBeInTheDocument();
    });

    await act(async () => {
      aStaleSuccess.resolve(response(unreadNotifications(9)));
    });

    expect(getBadge("nav.notifications", 1)).toBeInTheDocument();

    await act(async () => {
      aStaleError.reject(new Error("stale user request"));
    });

    expect(getBadge("nav.notifications", 1)).toBeInTheDocument();
  });

  test("keeps newer same-user socket and notification refresh state over older fetches", async () => {
    const olderMessages = deferred();
    const olderNotifications = deferred();
    const newerNotifications = deferred();
    const socket = createSocket();

    getSocketMock.mockReturnValue(socket);
    queueRequests({
      "/messages": [olderMessages],
      "/notifications": [olderNotifications, newerNotifications],
      "/salons/mine/manageable": [{ promise: Promise.resolve(response([])) }],
    });

    renderWithProviders(<Header />, {
      initialEntries: ["/admin/services"],
      preloadedState: { auth: barberAuth("user-a") },
    });

    window.dispatchEvent(new Event("notifications:updated"));
    socket.emit("newMessage", { receiverId: "user-a", isRead: false });

    await act(async () => {
      newerNotifications.resolve(response(unreadNotifications(3)));
    });

    await waitFor(() => {
      expect(getBadge("nav.messages", 1)).toBeInTheDocument();
      expect(getBadge("nav.notifications", 3)).toBeInTheDocument();
    });

    await act(async () => {
      olderMessages.resolve(response([]));
      olderNotifications.resolve(response(unreadNotifications(1)));
    });

    expect(getBadge("nav.messages", 1)).toBeInTheDocument();
    expect(getBadge("nav.notifications", 3)).toBeInTheDocument();
  });

  test("invalidates outstanding work and socket listeners on unmount", async () => {
    const messages = deferred();
    const notifications = deferred();
    const salon = deferred();
    const socket = createSocket();

    getSocketMock.mockReturnValue(socket);
    queueRequests({
      "/messages": [messages],
      "/notifications": [notifications],
      "/salons/mine/manageable": [salon],
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderWithProviders(<Header />, {
      initialEntries: ["/admin/services"],
      preloadedState: { auth: barberAuth("user-a") },
    });

    unmount();

    await act(async () => {
      messages.resolve(response(unreadMessages("user-a", 1)));
      notifications.resolve(response(unreadNotifications(1)));
      salon.resolve(response([{ ownerId: "user-a" }]));
    });

    expect(socket.off).toHaveBeenCalledWith("newMessage", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("notification", expect.any(Function));
    expect(consoleError).not.toHaveBeenCalled();
  });
});
