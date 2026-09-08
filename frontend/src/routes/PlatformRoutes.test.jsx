import { Suspense } from "react";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { platformRoutes } from "./PlatformRoutes";

vi.mock("../platform/pages/PlatformAuditPage", () => ({
  default: () => <div>Platform Audit route content</div>,
}));

const routesByPath = new Map(
  platformRoutes.props.children
    .filter((route) => route.props.path)
    .map((route) => [route.props.path, route])
);

const protectedCapability = (path) =>
  routesByPath.get(path).props.element.props.requiredPlatformCapability;

const renderAuditRoute = (currentUser) =>
  renderWithProviders(
    <Suspense fallback={<div>Loading route</div>}>
      <Routes>
        {platformRoutes}
        <Route path="/" element={<div>Platform route denied</div>} />
      </Routes>
    </Suspense>,
    {
      initialEntries: ["/admin/platform/audit"],
      preloadedState: { auth: { currentUser, isAuthenticated: true, token: "session-token" } },
    }
  );

describe("platform route capabilities", () => {
  test("maps platform dashboard and billing pages to billing.read", () => {
    for (const path of [
      "/admin/platform/dashboard",
      "/admin/platform/billing/salons",
      "/admin/platform/billing/salons/:salonId",
      "/admin/platform/billing/individuals",
    ]) {
      expect(protectedCapability(path)).toBe("billing.read");
    }
  });

  test("maps platform audit to audit.read", () => {
    expect(protectedCapability("/admin/platform/audit")).toBe("audit.read");
  });

  test("denies audit rendering to a platform session without audit.read", async () => {
    renderAuditRoute({
      role: "client",
      canAccessPlatform: true,
      platformCapabilities: ["billing.read"],
    });

    expect(await screen.findByText("Platform route denied")).toBeInTheDocument();
    expect(screen.queryByText("Platform Audit route content")).not.toBeInTheDocument();
  });

  test("renders audit for an explicit audit.read session", async () => {
    renderAuditRoute({
      role: "client",
      canAccessPlatform: true,
      platformCapabilities: ["audit.read"],
    });

    expect(await screen.findByText("Platform Audit route content")).toBeInTheDocument();
  });
});
