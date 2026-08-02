import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useNavigate } from "react-router-dom";

import Header from "./Header";
import { renderWithProviders } from "@/test/renderWithProviders";

const getSocketMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const performLogoutMock = vi.hoisted(() => vi.fn());
const changeLanguageMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/socket", () => ({
  getSocket: getSocketMock,
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: apiGetMock,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: changeLanguageMock,
    },
    t: (key) => key,
  }),
}));

vi.mock("@/shared/auth/performLogout", () => ({
  performLogout: performLogoutMock,
}));

function RouteChangeButton() {
  const navigate = useNavigate();

  return (
    <button onClick={() => navigate("/favorites")} type="button">
      go
    </button>
  );
}

const clientAuth = {
  currentUser: {
    id: "client-1",
    role: "client",
    name: "Client User",
  },
  token: "token-1",
  isAuthenticated: true,
};

const barberAuth = {
  currentUser: {
    id: "barber-1",
    role: "barber",
    name: "Barber User",
  },
  token: "token-2",
  isAuthenticated: true,
};

beforeEach(() => {
  getSocketMock.mockReset();
  apiGetMock.mockReset();
  performLogoutMock.mockReset();
  changeLanguageMock.mockReset();

  getSocketMock.mockReturnValue(null);
  apiGetMock.mockImplementation((url) => {
    if (
      url === "/messages" ||
      url === "/notifications" ||
      url === "/salons/mine/manageable"
    ) {
      return Promise.resolve({ data: [] });
    }

    return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
  });
  performLogoutMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Header accessibility", () => {
  test("adds client profile toggle semantics and menuitem semantics", async () => {
    const user = userEvent.setup();

    renderWithProviders(<Header />, {
      initialEntries: ["/profile"],
      preloadedState: { auth: clientAuth },
    });

    const toggle = screen.getByRole("button", { name: "nav.profile" });

    expect(toggle).toHaveAttribute("aria-haspopup", "menu");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "header-client-profile-menu");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const menu = screen.getByRole("menu");

    expect(menu).toHaveAttribute("id", "header-client-profile-menu");
    expect(within(menu).getByRole("menuitem", { name: "nav.logout" })).toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("closes the client profile menu on Escape and outside click", async () => {
    const user = userEvent.setup();

    renderWithProviders(<Header />, {
      initialEntries: ["/profile"],
      preloadedState: { auth: clientAuth },
    });

    const toggle = screen.getByRole("button", { name: "nav.profile" });

    await user.click(toggle);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    await user.click(toggle);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  test("closes the client profile menu when the pathname changes", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <Header />
        <RouteChangeButton />
      </>,
      {
        initialEntries: ["/profile"],
        preloadedState: { auth: clientAuth },
      }
    );

    await user.click(screen.getByRole("button", { name: "nav.profile" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "go" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  test("adds mobile group aria-controls and preserves single-group expansion", async () => {
    const user = userEvent.setup();

    renderWithProviders(<Header />, {
      initialEntries: ["/admin"],
      preloadedState: { auth: barberAuth },
    });

    await user.click(screen.getByRole("button", { name: "nav.toggleMenu" }));

    const accountGroup = screen.getByRole("button", { name: "nav.account" });

    expect(accountGroup).toHaveAttribute("aria-expanded", "false");
    expect(accountGroup).toHaveAttribute("aria-controls", "header-mobile-group-account");

    await user.click(accountGroup);

    expect(accountGroup).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "nav.settingsHub" })).toBeInTheDocument();
    expect(document.getElementById("header-mobile-group-account")).toBeInTheDocument();

    const marketingGroup = screen.getByRole("button", { name: "nav.marketing" });

    await user.click(marketingGroup);

    expect(accountGroup).toHaveAttribute("aria-expanded", "false");
    expect(marketingGroup).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("header-mobile-group-account")).not.toBeInTheDocument();
    expect(document.getElementById("header-mobile-group-marketing")).toBeInTheDocument();

    await user.click(marketingGroup);

    expect(marketingGroup).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("header-mobile-group-marketing")).not.toBeInTheDocument();
  });

  test("preserves barber desktop menu rendering", async () => {
    const user = userEvent.setup();

    renderWithProviders(<Header />, {
      initialEntries: ["/admin/services"],
      preloadedState: { auth: barberAuth },
    });

    const moreButton = screen.getByRole("button", { name: "nav.more" });

    expect(moreButton).toHaveAttribute("aria-haspopup", "menu");
    expect(moreButton.closest("div")).toHaveClass("hidden", "lg:block");
    await user.click(moreButton);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nav.account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "nav.profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nav.toggleMenu" })).toBeInTheDocument();
  });
});
