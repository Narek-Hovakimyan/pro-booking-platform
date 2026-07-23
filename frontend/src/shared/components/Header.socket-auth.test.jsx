import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Header from "./Header";
import { renderWithProviders } from "@/test/renderWithProviders";

const getSocketMock = vi.hoisted(() => vi.fn());
const connectSocketMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/socket", () => ({
  getSocket: getSocketMock,
  connectSocket: connectSocketMock,
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn((url) => {
      if (
        url === "/messages" ||
        url === "/notifications" ||
        url === "/salons/mine/manageable"
      ) {
        return Promise.resolve({ data: [] });
      }

      return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
    }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: vi.fn(),
    },
    t: (key) => key,
  }),
}));

vi.mock("@/shared/auth/performLogout", () => ({
  performLogout: vi.fn(),
}));

vi.mock("@/shared/components/NestedHeaderMenu", () => ({
  default: () => null,
}));

function createFakeSocket() {
  return {
    on: vi.fn(),
    off: vi.fn(),
  };
}

const auth = {
  currentUser: {
    id: "user-1",
    role: "client",
    name: "Client User",
  },
  token: "token-1",
  isAuthenticated: true,
};

beforeEach(() => {
  getSocketMock.mockReset();
  connectSocketMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Header Socket.IO auth behavior", () => {
  test("uses only the existing App-owned socket and never creates one", async () => {
    getSocketMock.mockReturnValue(null);

    renderWithProviders(<Header />, {
      initialEntries: ["/messages"],
      preloadedState: { auth },
    });

    await waitFor(() => expect(getSocketMock).toHaveBeenCalled());

    expect(connectSocketMock).not.toHaveBeenCalled();
  });

  test("attaches and cleans listeners on the existing socket", async () => {
    const socket = createFakeSocket();
    getSocketMock.mockReturnValue(socket);

    const { unmount } = renderWithProviders(<Header />, {
      initialEntries: ["/messages"],
      preloadedState: { auth },
    });

    await waitFor(() => {
      expect(socket.on).toHaveBeenCalledWith("newMessage", expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith("notification", expect.any(Function));
    });

    unmount();

    expect(socket.off).toHaveBeenCalledWith("newMessage", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("notification", expect.any(Function));
    expect(connectSocketMock).not.toHaveBeenCalled();
  });
});
