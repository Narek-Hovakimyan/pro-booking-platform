import { expect, test } from "vitest";

import { getBarberAdminRoutes } from "./BarberAdminRoutes";

test("certifications admin route requires the shared subscription guard mechanism", () => {
  const calls = [];

  getBarberAdminRoutes({
    renderAdminPage(section, options) {
      calls.push({ section, options });
      return null;
    },
  });

  expect(
    calls.find((call) => call.section === "settings-certifications"),
  ).toEqual({ section: "settings-certifications", options: { requireSubscription: true } });
});
