import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import NestedHeaderMenu from "./NestedHeaderMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

const renderMenu = (canReadPlatformBilling, currentUser = { name: "Platform User" }) =>
  render(
    <MemoryRouter>
      <NestedHeaderMenu
        variant="mobile"
        isOpen
        currentUser={currentUser}
        canReadPlatformBilling={canReadPlatformBilling}
      />
    </MemoryRouter>
  );

describe("NestedHeaderMenu platform capability visibility", () => {
  test("hides platform billing navigation without billing.read", () => {
    renderMenu(false);

    expect(screen.queryByRole("button", { name: "nav.platform" })).not.toBeInTheDocument();
  });

  test("shows platform billing navigation with billing.read", () => {
    renderMenu(true);

    fireEvent.click(screen.getByRole("button", { name: "nav.platform" }));
    expect(screen.getByRole("button", { name: "nav.platformBilling" })).toBeInTheDocument();
  });

  test("shows only audit navigation for an audit.read user", () => {
    renderMenu(false, {
      name: "Audit User",
      canAccessPlatform: true,
      platformCapabilities: ["audit.read"],
    });

    fireEvent.click(screen.getByRole("button", { name: "nav.platform" }));
    expect(screen.getByRole("button", { name: "Platform Audit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "nav.platformBilling" })).not.toBeInTheDocument();
  });
});
