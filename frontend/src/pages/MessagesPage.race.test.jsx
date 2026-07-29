import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import { restoreAuthSession } from "@/store/slices/authSlice";
import { contactsCacheByUserId, messagesCacheByConversationKey } from "@/features/messages/utils/messageHelpers";
import MessagesPage from "./MessagesPage";
import api from "@/shared/api/axios";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock("@/shared/lib/socket", () => ({
  getSocket: vi.fn(() => null),
}));

vi.mock("@/features/messages/components/MessagesPageLayout", () => ({
  default: ({ chatPanelProps, conversationListProps, error }) => (
    <div>
      <div data-testid="error">{error}</div>
      <div data-testid="selected-user">{chatPanelProps.selectedUser?.id || "none"}</div>
      <div data-testid="messages-loading">{String(chatPanelProps.isMessagesLoading)}</div>
      <div data-testid="messages-refreshing">{String(chatPanelProps.isMessagesRefreshing)}</div>
      <div data-testid="sending">{String(chatPanelProps.isSending)}</div>
      <input
        aria-label="message-input"
        value={chatPanelProps.text}
        onChange={(event) => chatPanelProps.onTextChange(event.target.value)}
      />
      <button onClick={(event) => chatPanelProps.onSendMessage(event)}>send</button>
      <div data-testid="message-texts">
        {(chatPanelProps.messages || []).map((message) => (
          <div key={message.id}>{message.text}</div>
        ))}
      </div>
      <div data-testid="contacts">
        {(conversationListProps.conversations || []).map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => conversationListProps.onSelectConversation(conversation)}
          >
            {conversation.name}:{conversation.unreadCount}
          </button>
        ))}
      </div>
    </div>
  ),
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

function buildMessage({
  id,
  senderId,
  receiverId,
  text,
  isRead = false,
  createdAt = "2026-07-29T10:00:00.000Z",
}) {
  return {
    id,
    _id: id,
    text,
    isRead,
    createdAt,
    senderId: { id: senderId, _id: senderId, name: senderId },
    receiverId: { id: receiverId, _id: receiverId, name: receiverId },
  };
}

function renderMessagesPage({
  route = "/messages",
  currentUserId = "account-a",
} = {}) {
  return renderWithProviders(
    <Routes>
      <Route path="/messages/:userId?" element={<MessagesPage />} />
    </Routes>,
    {
      initialEntries: [route],
      preloadedState: {
        auth: {
          currentUser: { id: currentUserId, role: "client", name: currentUserId },
          token: "token",
          isAuthenticated: true,
        },
      },
    }
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  contactsCacheByUserId.clear();
  messagesCacheByConversationKey.clear();
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  window.requestAnimationFrame = vi.fn((callback) => callback());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MessagesPage request guards", () => {
  it("keeps conversation B visible when conversation A resolves late", async () => {
    const aMessages = deferred();
    const bMessages = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return Promise.resolve({
          data: [
            buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
            buildMessage({ id: "c-b", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
          ],
        });
      }
      if (url === "/messages/friend-a") return aMessages.promise;
      if (url === "/messages/friend-b") return bMessages.promise;
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockResolvedValue({ data: { modifiedCount: 1 } });

    renderMessagesPage();

    fireEvent.click(await screen.findByText("friend-a:1"));
    fireEvent.click(await screen.findByText("friend-b:1"));

    await act(async () => {
      bMessages.resolve({
        data: [buildMessage({ id: "b-1", senderId: "friend-b", receiverId: "account-a", text: "B only" })],
      });
    });

    expect(await screen.findByText("B only")).toBeVisible();
    expect(screen.getByTestId("selected-user")).toHaveTextContent("friend-b");

    await act(async () => {
      aMessages.resolve({
        data: [buildMessage({ id: "a-1", senderId: "friend-a", receiverId: "account-a", text: "A stale" })],
      });
    });

    await flush();
    expect(screen.getByTestId("selected-user")).toHaveTextContent("friend-b");
    expect(screen.queryByText("A stale")).not.toBeInTheDocument();
    expect(screen.getByText("B only")).toBeVisible();
  });

  it("ignores stale failures and stale finally blocks after switching conversations", async () => {
    const aMessages = deferred();
    const bMessages = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return Promise.resolve({
          data: [
            buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
            buildMessage({ id: "c-b", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
          ],
        });
      }
      if (url === "/messages/friend-a") return aMessages.promise;
      if (url === "/messages/friend-b") return bMessages.promise;
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockResolvedValue({ data: { modifiedCount: 1 } });

    renderMessagesPage();

    fireEvent.click(await screen.findByText("friend-a:1"));
    fireEvent.click(await screen.findByText("friend-b:1"));
    expect(screen.getByTestId("messages-loading")).toHaveTextContent("true");

    await act(async () => {
      aMessages.reject(new Error("stale failure"));
    });

    await flush();
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("messages-loading")).toHaveTextContent("true");

    await act(async () => {
      bMessages.resolve({
        data: [buildMessage({ id: "b-2", senderId: "friend-b", receiverId: "account-a", text: "B fresh" })],
      });
    });

    expect(await screen.findByText("B fresh")).toBeVisible();
    expect(screen.getByTestId("messages-loading")).toHaveTextContent("false");
  });

  it("invalidates prior-account reads and visible state on account change", async () => {
    const aMessages = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return Promise.resolve({
          data: [
            buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
            buildMessage({ id: "c-c", senderId: "friend-c", receiverId: "account-b", text: "C latest" }),
          ],
        });
      }
      if (url === "/messages/friend-a") return aMessages.promise;
      if (url === "/messages/friend-c") {
        return Promise.resolve({
          data: [buildMessage({ id: "c-1", senderId: "friend-c", receiverId: "account-b", text: "B account thread" })],
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockResolvedValue({ data: { modifiedCount: 1 } });

    const { store } = renderMessagesPage();

    fireEvent.click(await screen.findByText("friend-a:1"));
    expect(screen.getByTestId("selected-user")).toHaveTextContent("friend-a");

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          user: { id: "account-b", role: "client", name: "account-b" },
          token: "token",
        })
      );
    });

    expect(screen.getByTestId("selected-user")).toHaveTextContent("none");

    await act(async () => {
      aMessages.resolve({
        data: [buildMessage({ id: "a-2", senderId: "friend-a", receiverId: "account-a", text: "A leaked" })],
      });
    });

    await flush();
    expect(screen.queryByText("A leaked")).not.toBeInTheDocument();
    expect(await screen.findByText("friend-c:1")).toBeVisible();
  });

  it("keeps polling for an old conversation from overwriting a newer selection", async () => {
    const pollContacts = deferred();
    const pollMessages = deferred();
    const intervalCallbacks = [];
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      });
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return pollContacts.promise;
      }
      if (url === "/messages/friend-a") {
        return Promise.resolve({
          data: [buildMessage({ id: "a-now", senderId: "friend-a", receiverId: "account-a", text: "A current" })],
        });
      }
      if (url === "/messages/friend-b") {
        return Promise.resolve({
          data: [buildMessage({ id: "b-now", senderId: "friend-b", receiverId: "account-a", text: "B current" })],
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockResolvedValue({ data: { modifiedCount: 1 } });

    renderMessagesPage({
      route: "/messages/friend-a",
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      pollContacts.resolve({
        data: [
          buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
          buildMessage({ id: "c-b", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
        ],
      });
    });

    expect(await screen.findByText("A current")).toBeVisible();

    api.get.mockImplementation((url) => {
      if (url === "/messages") return Promise.resolve({
        data: [
          buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
          buildMessage({ id: "c-b", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
        ],
      });
      if (url === "/messages/friend-a") return pollMessages.promise;
      if (url === "/messages/friend-b") {
        return Promise.resolve({
          data: [buildMessage({ id: "b-new", senderId: "friend-b", receiverId: "account-a", text: "B replacement" })],
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    await act(async () => {
      await intervalCallbacks.at(-1)();
    });

    fireEvent.click(await screen.findByText("friend-b:1"));
    expect(await screen.findByText("B replacement")).toBeVisible();

    await act(async () => {
      pollMessages.resolve({
        data: [buildMessage({ id: "a-stale", senderId: "friend-a", receiverId: "account-a", text: "A polled stale" })],
      });
    });

    await flush();
    expect(screen.queryByText("A polled stale")).not.toBeInTheDocument();
    expect(screen.getByText("B replacement")).toBeVisible();
    setIntervalSpy.mockRestore();
  });

  it("ignores late send completion after switching conversations", async () => {
    const sendDeferred = deferred();
    const aRefresh = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return Promise.resolve({
          data: [
            buildMessage({ id: "c-a", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
            buildMessage({ id: "c-b", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
          ],
        });
      }
      if (url === "/messages/friend-a") return aRefresh.promise;
      if (url === "/messages/friend-b") {
        return Promise.resolve({
          data: [buildMessage({ id: "b-3", senderId: "friend-b", receiverId: "account-a", text: "B current" })],
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockResolvedValue({ data: { modifiedCount: 1 } });
    api.post.mockImplementation(() => sendDeferred.promise);

    renderMessagesPage();

    fireEvent.click(await screen.findByText("friend-a:1"));
    await act(async () => {
      aRefresh.resolve({
        data: [buildMessage({ id: "a-3", senderId: "friend-a", receiverId: "account-a", text: "A current" })],
      });
    });
    expect(await screen.findByText("A current")).toBeVisible();

    fireEvent.change(screen.getByLabelText("message-input"), { target: { value: "hello from A" } });
    fireEvent.click(screen.getByText("send"));
    expect(screen.getByTestId("sending")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("friend-b:1"));
    expect(await screen.findByText("B current")).toBeVisible();
    expect(screen.getByTestId("sending")).toHaveTextContent("false");

    await act(async () => {
      sendDeferred.resolve({
        data: buildMessage({ id: "sent-a", senderId: "account-a", receiverId: "friend-a", text: "sent stale" }),
      });
    });

    await flush();
    expect(screen.queryByText("sent stale")).not.toBeInTheDocument();
    expect(screen.getByText("B current")).toBeVisible();
  });

  it("ignores late read completion after switching conversations", async () => {
    const readDeferred = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/messages") {
        return Promise.resolve({
          data: [
            buildMessage({ id: "a-unread", senderId: "friend-a", receiverId: "account-a", text: "A latest" }),
            buildMessage({ id: "b-unread", senderId: "friend-b", receiverId: "account-a", text: "B latest" }),
          ],
        });
      }
      if (url === "/messages/friend-a") {
        return Promise.resolve({
          data: [buildMessage({ id: "a-4", senderId: "friend-a", receiverId: "account-a", text: "A thread" })],
        });
      }
      if (url === "/messages/friend-b") {
        return Promise.resolve({
          data: [buildMessage({ id: "b-4", senderId: "friend-b", receiverId: "account-a", text: "B thread" })],
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    api.put.mockImplementation((url) => (
      url === "/messages/read/friend-a"
        ? readDeferred.promise
        : Promise.resolve({ data: { modifiedCount: 1 } })
    ));

    renderMessagesPage();

    fireEvent.click(await screen.findByText("friend-a:1"));
    expect(await screen.findByText("A thread")).toBeVisible();
    fireEvent.click(screen.getByText("friend-b:1"));
    expect(await screen.findByText("B thread")).toBeVisible();

    await act(async () => {
      readDeferred.resolve({ data: { modifiedCount: 1 } });
    });

    await flush();
    expect(screen.getByText("friend-a:1")).toBeVisible();
    expect(screen.getByText("B thread")).toBeVisible();
  });
});
