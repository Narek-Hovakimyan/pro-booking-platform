import { StrictMode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import { restoreAuthSession } from "@/store/slices/authSlice";
import api from "@/shared/api/axios";
import NotificationsPage from "./NotificationsPage";

let latestNotificationsListProps = null;

vi.mock("@/shared/api/axios", () => ({
  default: { delete: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn() },
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
    isClearingAll,
    jobApplicationById,
    onBookingAction,
    onDelete,
    onEventAction,
    onJobAction,
    onMarkRead,
    onView,
  }) => {
    latestNotificationsListProps = {
      activeAction,
      eventRegistrationById,
      groupedNotifications,
      isClearingAll,
      jobApplicationById,
      onBookingAction,
      onDelete,
      onEventAction,
      onJobAction,
      onMarkRead,
      onView,
    };
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
              <button
                disabled={isClearingAll}
                onClick={() => onDelete(notification.id)}
              >
                delete {notification.id}
              </button>
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

function renderNotificationsPageInStrictMode(
  currentUser = { id: "account-a", role: "client" },
) {
  return renderWithProviders(
    <StrictMode>
      <Routes>
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/target/:id" element={<div>target page</div>} />
      </Routes>
    </StrictMode>,
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
  latestNotificationsListProps = null;
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
  it("completes the initial load under StrictMode and preserves cache behavior", async () => {
    api.get.mockResolvedValueOnce({
      data: [notification("strict-1", "Strict notification")],
    });

    renderNotificationsPageInStrictMode();

    expect(await screen.findByText("Strict notification")).toBeVisible();
    expect(screen.getByTestId("initial-loading")).toHaveTextContent("false");
    await waitFor(() => {
      expect(NotificationsPage.__getNotificationsCacheForTests("account-a")).toEqual([
        expect.objectContaining({
          id: "strict-1",
          message: "Strict notification",
        }),
      ]);
    });
  });

  it("exits loading and shows the empty state for an empty StrictMode response", async () => {
    api.get.mockResolvedValueOnce({ data: [] });

    renderNotificationsPageInStrictMode();

    expect(await screen.findByText("No notifications")).toBeVisible();
    expect(screen.getByTestId("initial-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("exits loading on initial failure and retry recovers in StrictMode", async () => {
    api.get
      .mockRejectedValueOnce({
        response: { data: { message: "Could not load notifications." } },
      })
      .mockResolvedValueOnce({
        data: [notification("retry-1", "Recovered notification")],
      });

    renderNotificationsPageInStrictMode();

    expect(await screen.findByText("Could not load notifications.")).toBeVisible();
    expect(screen.getByTestId("initial-loading")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("retry"));

    expect(await screen.findByText("Recovered notification")).toBeVisible();
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("initial-loading")).toHaveTextContent("false");
  });

  it("blocks stale async completion after a real unmount", async () => {
    const initialLoad = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/notifications") return initialLoad.promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { unmount } = renderNotificationsPageInStrictMode();

    expect(screen.getByTestId("initial-loading")).toHaveTextContent("true");

    unmount();

    await act(async () => {
      initialLoad.resolve({ data: [notification("late-1", "Late notification")] });
    });
    await flush();

    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "notifications:updated" }),
    );
    expect(NotificationsPage.__getNotificationsCacheForTests("account-a")).toEqual([]);
  });

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
      expect(screen.getByText("1 unread")).toBeInTheDocument();
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

  it("keeps booking accept ordering as update then read then refresh", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/notifications") {
        return Promise.resolve({
          data: [
            notification("booking-1", "Booking request", {
              data: { bookingId: "booking-1" },
              type: "booking_created",
            }),
          ],
        });
      }

      if (url === "/bookings/barber/account-a") {
        return Promise.resolve({
          data: [{ _id: "booking-1", barberId: "account-a", status: "pending" }],
        });
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    api.put.mockImplementation((url) => {
      if (url === "/bookings/booking-1") {
        return Promise.resolve({ data: { id: "booking-1", status: "accepted" } });
      }

      if (url === "/notifications/booking-1/read") {
        return Promise.resolve({
          data: notification("booking-1", "Booking request", {
            data: { bookingId: "booking-1" },
            isRead: true,
            type: "booking_created",
          }),
        });
      }

      throw new Error(`Unexpected PUT ${url}`);
    });

    renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("Booking request")).toBeVisible();
    api.get.mockClear();
    api.put.mockClear();

    fireEvent.click(screen.getByText("accept booking-1"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/bookings/booking-1", {
        status: "accepted",
      });
      expect(api.put).toHaveBeenCalledWith("/notifications/booking-1/read");
      expect(api.get).toHaveBeenCalledWith("/bookings/barber/account-a");
    });

    const bookingUpdateOrder = api.put.mock.invocationCallOrder[0];
    const markReadOrder = api.put.mock.invocationCallOrder[1];
    const refreshOrder = api.get.mock.invocationCallOrder[0];
    expect(bookingUpdateOrder).toBeLessThan(markReadOrder);
    expect(markReadOrder).toBeLessThan(refreshOrder);
  });

  it("submits booking rejection through the modal and refreshes after marking read", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/notifications") {
        return Promise.resolve({
          data: [
            notification("booking-2", "Reject this booking", {
              data: { bookingId: "booking-2" },
              type: "booking_created",
            }),
          ],
        });
      }

      if (url === "/bookings/barber/account-a") {
        return Promise.resolve({
          data: [{ _id: "booking-2", barberId: "account-a", status: "pending" }],
        });
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    api.put.mockImplementation((url, payload) => {
      if (url === "/bookings/booking-2") {
        expect(payload).toEqual({
          status: "rejected",
          rejectionReason: "No availability today",
        });
        return Promise.resolve({ data: { id: "booking-2", status: "rejected" } });
      }

      if (url === "/notifications/booking-2/read") {
        return Promise.resolve({
          data: notification("booking-2", "Reject this booking", {
            data: { bookingId: "booking-2" },
            isRead: true,
            type: "booking_created",
          }),
        });
      }

      throw new Error(`Unexpected PUT ${url}`);
    });

    renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("Reject this booking")).toBeVisible();
    api.get.mockClear();
    api.put.mockClear();

    await act(async () => {
      await latestNotificationsListProps.onBookingAction(
        notification("booking-2", "Reject this booking", {
          data: { bookingId: "booking-2" },
          type: "booking_created",
        }),
        { id: "booking-2", status: "pending" },
        "reject-booking",
      );
    });

    fireEvent.change(screen.getByLabelText("Reason for rejection"), {
      target: { value: "No availability today" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/bookings/booking-2", {
        status: "rejected",
        rejectionReason: "No availability today",
      });
      expect(api.put).toHaveBeenCalledWith("/notifications/booking-2/read");
      expect(api.get).toHaveBeenCalledWith("/bookings/barber/account-a");
    });
  });

  it("routes reschedule accept and reject through the existing patch endpoints", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/notifications") {
        return Promise.resolve({
          data: [
            notification("reschedule-1", "Reschedule request", {
              data: { bookingId: "reschedule-1" },
              type: "booking_reschedule_requested",
            }),
          ],
        });
      }

      if (url === "/bookings/barber/account-a") {
        return Promise.resolve({
          data: [
            {
              _id: "reschedule-1",
              barberId: "account-a",
              status: "accepted",
              rescheduleRequest: { status: "pending" },
            },
          ],
        });
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    api.put.mockImplementation((url) => {
      if (url === "/notifications/reschedule-1/read") {
        return Promise.resolve({
          data: notification("reschedule-1", "Reschedule request", {
            data: { bookingId: "reschedule-1" },
            isRead: true,
            type: "booking_reschedule_requested",
          }),
        });
      }

      throw new Error(`Unexpected PUT ${url}`);
    });

    api.patch
      .mockResolvedValueOnce({ data: { id: "reschedule-1", status: "accepted" } })
      .mockResolvedValueOnce({ data: { id: "reschedule-1", status: "accepted" } });

    renderNotificationsPage({ id: "account-a", role: "barber" });
    expect(await screen.findByText("Reschedule request")).toBeVisible();

    await act(async () => {
      await latestNotificationsListProps.onBookingAction(
        notification("reschedule-1", "Reschedule request", {
          data: { bookingId: "reschedule-1" },
          type: "booking_reschedule_requested",
        }),
        {
          id: "reschedule-1",
          status: "accepted",
          rescheduleRequest: { status: "pending" },
        },
        "accept-reschedule",
      );
    });

    await act(async () => {
      await latestNotificationsListProps.onBookingAction(
        notification("reschedule-1", "Reschedule request", {
          data: { bookingId: "reschedule-1" },
          type: "booking_reschedule_requested",
          isRead: true,
        }),
        {
          id: "reschedule-1",
          status: "accepted",
          rescheduleRequest: { status: "pending" },
        },
        "reject-reschedule",
      );
    });

    expect(api.patch).toHaveBeenCalledWith(
      "/bookings/reschedule-1/reschedule-request/accept",
      {},
    );
    expect(api.patch).toHaveBeenCalledWith(
      "/bookings/reschedule-1/reschedule-request/reject",
      {},
    );
  });

  it("requires confirmation before clearing and cancel keeps notifications", async () => {
    api.get.mockResolvedValueOnce({
      data: [
        notification("n-1", "First notification"),
        notification("n-2", "Second notification"),
      ],
    });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("dialog", { name: "Clear all notifications?" })).toBeVisible();
    expect(api.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Clear all notifications?" })).not.toBeInTheDocument();
    expect(screen.getByText("First notification")).toBeVisible();
    expect(screen.getByText("Second notification")).toBeVisible();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("prevents duplicate clear submissions and clears only after success", async () => {
    const clearAction = deferred();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    api.get.mockResolvedValueOnce({
      data: [
        notification("n-1", "First notification"),
        notification("n-2", "Second notification"),
      ],
    });
    api.delete.mockImplementation((url) => {
      if (url === "/notifications/user/all") return clearAction.promise;
      throw new Error(`Unexpected DELETE ${url}`);
    });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    const confirmButton = screen.getByRole("button", { name: "Clear notifications" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(api.delete).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "delete n-1" })).toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "delete n-1" }));
    latestNotificationsListProps.onDelete("n-1");
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("First notification")).toBeVisible();
    expect(screen.getByText("Second notification")).toBeVisible();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Clearing..." }).every(
          (button) => button.disabled,
        ),
      ).toBe(true);
    });

    await act(async () => {
      clearAction.resolve({ data: { deletedCount: 2 } });
    });

    expect(await screen.findByText("No notifications")).toBeVisible();
    expect(screen.queryByText("First notification")).not.toBeInTheDocument();
    expect(NotificationsPage.__getNotificationsCacheForTests("account-a")).toEqual([]);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notifications:updated" }),
    );
  });

  it("preserves the full list and shows an error when clear all fails", async () => {
    api.get.mockResolvedValueOnce({
      data: [
        notification("n-1", "First notification"),
        notification("n-2", "Second notification"),
      ],
    });
    api.delete.mockRejectedValueOnce({
      response: { data: { message: "Could not clear now." } },
    });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(await screen.findByText("Could not clear now.")).toBeVisible();
    expect(screen.getByText("First notification")).toBeVisible();
    expect(screen.getByText("Second notification")).toBeVisible();
    expect(screen.getByRole("button", { name: "delete n-1" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "delete n-1" }));
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/notifications/n-1");
    });
  });

  it("keeps mark-all-read pending separate from clear-all and per-item delete state", async () => {
    const markAllReadAction = deferred();

    api.get.mockResolvedValueOnce({
      data: [
        notification("n-1", "First notification"),
        notification("n-2", "Second notification"),
      ],
    });
    api.put.mockImplementation((url) => {
      if (url === "/notifications/read") return markAllReadAction.promise;
      throw new Error(`Unexpected PUT ${url}`);
    });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Marking..." })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "delete n-1" })).not.toBeDisabled();

    await act(async () => {
      markAllReadAction.resolve({ data: {} });
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Mark all read" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Clear all" })).not.toBeDisabled();
  });

  it("suppresses stale polling responses after a successful clear all", async () => {
    const stalePoll = deferred();
    let notificationLoadCount = 0;

    api.get.mockImplementation((url) => {
      if (url !== "/notifications") throw new Error(`Unexpected GET ${url}`);
      notificationLoadCount += 1;
      if (notificationLoadCount === 1) {
        return Promise.resolve({ data: [notification("n-1", "First notification")] });
      }
      return stalePoll.promise;
    });
    api.delete.mockResolvedValueOnce({ data: { deletedCount: 1 } });

    renderNotificationsPage();
    expect(await screen.findByText("First notification")).toBeVisible();

    fireEvent.click(screen.getByText("retry"));
    await waitFor(() => {
      expect(notificationLoadCount).toBe(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));

    await waitFor(() => {
      expect(screen.getByText("No notifications")).toBeVisible();
    });

    await act(async () => {
      stalePoll.resolve({ data: [notification("n-stale", "Stale notification")] });
    });
    await flush();

    expect(screen.queryByText("Stale notification")).not.toBeInTheDocument();
    expect(screen.getByText("No notifications")).toBeVisible();
  });

  it("ignores stale mark-all-read completion after switching accounts", async () => {
    const accountAMarkAllRead = deferred();
    let notificationLoadCount = 0;

    api.get.mockImplementation((url) => {
      if (url !== "/notifications") throw new Error(`Unexpected GET ${url}`);
      notificationLoadCount += 1;
      if (notificationLoadCount === 1) {
        return Promise.resolve({ data: [notification("a-1", "A notification")] });
      }
      return Promise.resolve({ data: [notification("b-1", "B notification")] });
    });
    api.put.mockImplementation((url) => {
      if (url === "/notifications/read") return accountAMarkAllRead.promise;
      throw new Error(`Unexpected PUT ${url}`);
    });

    const { store } = renderNotificationsPage({ id: "account-a", role: "client" });
    expect(await screen.findByText("A notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "client" },
        }),
      );
    });

    expect(await screen.findByText("B notification")).toBeVisible();
    expect(screen.getByText("1 unread")).toBeVisible();

    await act(async () => {
      accountAMarkAllRead.resolve({ data: {} });
    });
    await flush();

    expect(screen.getByText("B notification")).toBeVisible();
    expect(screen.getByText("1 unread")).toBeVisible();
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("does not let an account A clear completion mutate account B", async () => {
    const accountAClear = deferred();
    let notificationLoadCount = 0;

    api.get.mockImplementation((url) => {
      if (url !== "/notifications") throw new Error(`Unexpected GET ${url}`);
      notificationLoadCount += 1;
      if (notificationLoadCount === 1) {
        return Promise.resolve({ data: [notification("a-1", "A notification")] });
      }
      return Promise.resolve({ data: [notification("b-1", "B notification")] });
    });
    api.delete.mockImplementation((url) => {
      if (url === "/notifications/user/all") return accountAClear.promise;
      throw new Error(`Unexpected DELETE ${url}`);
    });

    const { store } = renderNotificationsPage({ id: "account-a", role: "client" });
    expect(await screen.findByText("A notification")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear notifications" }));

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          token: "token",
          user: { id: "account-b", role: "client" },
        }),
      );
    });

    expect(await screen.findByText("B notification")).toBeVisible();

    await act(async () => {
      accountAClear.resolve({ data: { deletedCount: 1 } });
    });
    await flush();

    expect(screen.getByText("B notification")).toBeVisible();
    expect(screen.queryByText("No notifications")).not.toBeInTheDocument();
  });
});
