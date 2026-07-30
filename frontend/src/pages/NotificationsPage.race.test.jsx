import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import { restoreAuthSession } from "@/store/slices/authSlice";
import api from "@/shared/api/axios";
import NotificationsPage from "./NotificationsPage";

vi.mock("@/shared/api/axios", () => ({
  default: { delete: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));

vi.mock("@/client/components/notifications/NotificationsHeader", () => ({
  default: ({ onClearAll, onMarkAllRead, unreadCount }) => (
    <div>
      <div data-testid="unread-count">{unreadCount}</div>
      <button onClick={onClearAll}>clear all</button>
      <button onClick={onMarkAllRead}>mark all</button>
    </div>
  ),
}));

vi.mock("@/client/components/notifications/NotificationsStatus", () => ({
  default: ({ error, initialLoading, onRetry, refreshing }) => (
    <div>
      <div data-testid="error">{error}</div>
      <div data-testid="initial-loading">{String(initialLoading)}</div>
      <div data-testid="refreshing">{String(refreshing)}</div>
      <button onClick={onRetry}>retry</button>
    </div>
  ),
}));

vi.mock("@/client/components/notifications/NotificationsEmptyState", () => ({
  default: () => <div>No notifications</div>,
}));

vi.mock("@/client/components/notifications/NotificationsList", () => ({
  default: ({
    activeAction,
    eventRegistrationById,
    groupedNotifications,
    jobApplicationById,
    onBookingAction,
    onDelete,
    onEventAction,
    onJobAction,
    onMarkRead,
    onView,
  }) => {
    const notifications = Object.values(groupedNotifications).flat();

    return (
      <div>
        <div data-testid="active-action">
          {activeAction ? `${activeAction.notificationId}:${activeAction.action}` : "none"}
        </div>
        {notifications.map((notification) => {
          const eventRegistrationId = notification.data?.eventRegistrationId;
          const jobApplicationId = notification.data?.jobApplicationId;

          return (
            <div key={notification.id}>
              <span>{notification.message}</span>
              <button onClick={() => onMarkRead(notification.id)}>read {notification.id}</button>
              <button onClick={() => onDelete(notification.id)}>delete {notification.id}</button>
              <button onClick={() => onView(notification, `/target/${notification.id}`)}>
                view {notification.id}
              </button>
              <button
                onClick={() =>
                  onBookingAction(
                    notification,
                    { id: notification.data?.bookingId, status: "pending" },
                    "accept-booking",
                  )
                }
              >
                accept {notification.id}
              </button>
              {eventRegistrationId ? (
                <button
                  onClick={() =>
                    onEventAction(notification, "approve-event-registration")
                  }
                >
                  approve event {notification.id}
                </button>
              ) : null}
              {jobApplicationId ? (
                <button
                  onClick={() =>
                    onJobAction(
                      notification,
                      jobApplicationById.get(jobApplicationId),
                      "accept-job-application",
                    )
                  }
                >
                  accept job {notification.id}
                </button>
              ) : null}
              {eventRegistrationId ? (
                <span data-testid={`event-registration-${notification.id}`}>
                  {eventRegistrationById.get(eventRegistrationId)?.status || "missing"}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function notification(id, message, overrides = {}) {
  return {
    _id: id,
    id,
    createdAt: "2026-07-29T10:00:00.000Z",
    isRead: false,
    message,
    type: "system",
    ...overrides,
  };
}

function renderNotificationsPage(currentUser = { id: "account-a", role: "client" }) {
  return renderWithProviders(
    <Routes>
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/target/:id" element={<div>target page</div>} />
    </Routes>,
    {
      initialEntries: ["/notifications"],
      preloadedState: {
        auth: {
          currentUser,
          isAuthenticated: Boolean(currentUser),
          token: currentUser ? "token" : null,
        },
      },
    },
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  NotificationsPage.__clearNotificationsCacheForTests?.();
  api.delete.mockReset();
  api.get.mockReset();
  api.patch.mockReset();
  api.put.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NotificationsPage account isolation", () => {
  it("never exposes account A notifications on the first render after switching to account B", async () => {
    const accountBLoad = deferred();

    api.get
      .mockResolvedValueOnce({ data: [notification("a-1", "A cached")] })
      .mockImplementationOnce((url) => {
        if (url === "/notifications") return accountBLoad.promise;
        throw new Error(`Unexpected GET ${url}`);
      });

    const { store } = renderNotificationsPage();
    expect(await screen.findByText("A cached")).toBeVisible();

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "client" },
        }),
      );
    });

    expect(screen.queryByText("A cached")).not.toBeInTheDocument();
    expect(screen.getByTestId("initial-loading")).toHaveTextContent("true");

    await act(async () => {
      accountBLoad.resolve({ data: [notification("b-1", "B current")] });
    });

    expect(await screen.findByText("B current")).toBeVisible();
  });

  it("ignores stale event-registration fetch completions from account A", async () => {
    const eventRegistrations = deferred();
    const accountBLoad = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/notifications") {
        if (api.get.mock.calls.filter(([requestUrl]) => requestUrl === "/notifications").length === 1) {
          return Promise.resolve({
            data: [
              notification("event-a", "A event", {
                type: "event_registration_request",
                data: { eventId: "event-a", eventRegistrationId: "registration-a" },
              }),
            ],
          });
        }
        return accountBLoad.promise;
      }

      if (url === "/events/event-a/registrations") {
        return eventRegistrations.promise;
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    const { store } = renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("A event")).toBeVisible();

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "barber" },
        }),
      );
    });

    await act(async () => {
      accountBLoad.resolve({ data: [notification("b-1", "B current")] });
      eventRegistrations.reject(new Error("stale registrations failed"));
    });

    expect(await screen.findByText("B current")).toBeVisible();
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.queryByText("A event")).not.toBeInTheDocument();
  });

  it("ignores stale job-action catch and finally paths from account A", async () => {
    const accountAJobAction = deferred();
    const accountBJobAction = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/notifications") {
        const notificationCalls = api.get.mock.calls.filter(
          ([requestUrl]) => requestUrl === "/notifications",
        ).length;

        if (notificationCalls === 1) {
          return Promise.resolve({
            data: [
              notification("job-a", "A job", {
                type: "salon_job_application_submitted",
                data: { jobApplicationId: "application-a" },
              }),
            ],
          });
        }

        return Promise.resolve({
          data: [
            notification("job-b", "B job", {
              type: "salon_job_application_submitted",
              data: { jobApplicationId: "application-b" },
            }),
          ],
        });
      }

      if (url === "/salon-jobs/applications/managed") {
        const managedCalls = api.get.mock.calls.filter(
          ([requestUrl]) => requestUrl === "/salon-jobs/applications/managed",
        ).length;

        if (managedCalls === 1) {
          return Promise.resolve([{ data: [{ _id: "application-a", status: "pending" }] }][0]);
        }

        return Promise.resolve({ data: [{ _id: "application-b", status: "pending" }] });
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    api.patch.mockImplementation((url) => {
      if (url === "/salon-jobs/applications/application-a/status") {
        return accountAJobAction.promise;
      }

      if (url === "/salon-jobs/applications/application-b/status") {
        return accountBJobAction.promise;
      }

      throw new Error(`Unexpected PATCH ${url}`);
    });

    const { store } = renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("A job")).toBeVisible();

    fireEvent.click(screen.getByText("accept job job-a"));
    expect(screen.getByTestId("active-action")).toHaveTextContent(
      "job-a:accept-job-application",
    );

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "barber" },
        }),
      );
    });

    expect(await screen.findByText("B job")).toBeVisible();
    fireEvent.click(screen.getByText("accept job job-b"));
    expect(screen.getByTestId("active-action")).toHaveTextContent(
      "job-b:accept-job-application",
    );

    await act(async () => {
      accountAJobAction.reject(new Error("stale job failed"));
    });

    await flush();

    expect(screen.getByTestId("active-action")).toHaveTextContent(
      "job-b:accept-job-application",
    );
    expect(screen.getByTestId("error")).toHaveTextContent("");

    await act(async () => {
      accountBJobAction.resolve({ data: { _id: "application-b", status: "accepted" } });
    });
  });

  it("preserves concurrent read and delete updates in UI and cache", async () => {
    const readAction = deferred();
    const deleteAction = deferred();

    api.get.mockResolvedValueOnce({
      data: [
        notification("n-1", "First notification"),
        notification("n-2", "Second notification"),
        notification("n-3", "Third notification"),
      ],
    });

    api.put.mockImplementation((url) => {
      if (url === "/notifications/n-1/read") {
        return readAction.promise;
      }

      throw new Error(`Unexpected PUT ${url}`);
    });

    api.delete.mockImplementation((url) => {
      if (url === "/notifications/n-2") {
        return deleteAction.promise;
      }

      throw new Error(`Unexpected DELETE ${url}`);
    });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByText("read n-1"));
    fireEvent.click(screen.getByText("delete n-2"));

    await act(async () => {
      deleteAction.resolve({ data: {} });
    });

    await waitFor(() => {
      expect(screen.queryByText("Second notification")).not.toBeInTheDocument();
    });

    await act(async () => {
      readAction.resolve({
        data: notification("n-1", "First notification", { isRead: true }),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
    });

    expect(screen.getByText("First notification")).toBeVisible();
    expect(screen.getByText("Third notification")).toBeVisible();

    const cache = NotificationsPage.__getNotificationsCacheForTests("account-a");
    expect(cache).toHaveLength(2);
    expect(cache.map((item) => item.id)).toEqual(["n-1", "n-3"]);
    expect(cache.find((item) => item.id === "n-1")?.isRead).toBe(true);
  });

  it("keeps polling from account A from overwriting account B", async () => {
    const pollLoad = deferred();
    const accountBLoad = deferred();

    let notificationLoadCount = 0;
    api.get.mockImplementation((url) => {
      if (url !== "/notifications") throw new Error(`Unexpected GET ${url}`);
      notificationLoadCount += 1;
      if (notificationLoadCount === 1) {
        return Promise.resolve({ data: [notification("a-1", "A initial")] });
      }
      if (notificationLoadCount === 2) return pollLoad.promise;
      return accountBLoad.promise;
    });

    const { store } = renderNotificationsPage();
    expect(await screen.findByText("A initial")).toBeVisible();

    fireEvent.click(screen.getByText("retry"));
    await waitFor(() => {
      expect(notificationLoadCount).toBe(2);
    });

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "client" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("A initial")).not.toBeInTheDocument();
    });

    await act(async () => {
      accountBLoad.resolve({ data: [notification("b-1", "B current")] });
      pollLoad.resolve({ data: [notification("a-2", "A poll stale")] });
    });

    await flush();
    expect(screen.getByText("B current")).toBeVisible();
    expect(screen.queryByText("A poll stale")).not.toBeInTheDocument();
  });

  it("ignores late booking-action completion after account change", async () => {
    const bookingAction = deferred();

    let notificationLoadCount = 0;
    api.get.mockImplementation((url) => {
      if (url.startsWith("/bookings/barber/")) return Promise.resolve({ data: [] });
      if (url !== "/notifications") throw new Error(`Unexpected GET ${url}`);
      notificationLoadCount += 1;
      if (notificationLoadCount === 1) {
        return Promise.resolve({
          data: [
            notification("a-booking", "A booking", {
              data: { bookingId: "booking-a" },
              type: "booking_created",
            }),
          ],
        });
      }
      return Promise.resolve({ data: [notification("b-1", "B after booking")] });
    });
    api.put.mockImplementation((url) => {
      if (url === "/bookings/booking-a") return bookingAction.promise;
      throw new Error(`Unexpected PUT ${url}`);
    });

    const { store } = renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("A booking")).toBeVisible();

    fireEvent.click(screen.getByText("accept a-booking"));
    expect(screen.getByTestId("active-action")).toHaveTextContent("a-booking:accept-booking");

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "barber" },
        }),
      );
    });

    await act(async () => {
      bookingAction.resolve({ data: { id: "booking-a", status: "accepted" } });
    });

    expect(await screen.findByText("B after booking")).toBeVisible();
    expect(screen.getByTestId("active-action")).toHaveTextContent("none");
    expect(screen.queryByText("A booking")).not.toBeInTheDocument();
  });
});
