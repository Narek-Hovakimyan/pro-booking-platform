import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import ProtectedRoute from "./ProtectedRoute";
import { renderWithProviders } from "@/test/renderWithProviders";

const renderProtectedRoute = (currentUser, capability) =>
  renderWithProviders(
    <ProtectedRoute requiredPlatformCapability={capability}>
      <div>protected capability content</div>
    </ProtectedRoute>,
    {
      initialEntries: ["/admin/platform/billing/salons"],
      preloadedState: {
        auth: { currentUser, isAuthenticated: true, token: "session-token" },
      },
    }
  );

describe("ProtectedRoute platform capabilities", () => {
  test("allows an explicit matching capability", () => {
    renderProtectedRoute(
      {
        role: "client",
        canAccessPlatform: true,
        platformCapabilities: ["billing.read"],
      },
      "billing.read"
    );

    expect(screen.getByText("protected capability content")).toBeInTheDocument();
  });

  test("denies an explicit capability mismatch", () => {
    renderProtectedRoute(
      {
        role: "barber",
        canAccessPlatform: true,
        platformCapabilities: ["billing.read"],
      },
      "billing.manage"
    );

    expect(screen.queryByText("protected capability content")).not.toBeInTheDocument();
  });

  test("keeps legacy canAccessPlatform sessions working until refresh", () => {
    renderProtectedRoute({ role: "barber", canAccessPlatform: true }, "billing.read");

    expect(screen.getByText("protected capability content")).toBeInTheDocument();
  });
});
