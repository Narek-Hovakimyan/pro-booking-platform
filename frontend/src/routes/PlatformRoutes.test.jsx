import { describe, expect, test } from "vitest";

import { platformRoutes } from "./PlatformRoutes";

const routesByPath = new Map(
  platformRoutes.props.children
    .filter((route) => route.props.path)
    .map((route) => [route.props.path, route])
);

const protectedCapability = (path) =>
  routesByPath.get(path).props.element.props.requiredPlatformCapability;

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
});
