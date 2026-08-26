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

test("booking history uses the same subscription-guarded barber admin flow", () => {
  const calls = [];

  getBarberAdminRoutes({
    renderAdminPage(section, options) {
      calls.push({ section, options });
      return null;
    },
  });

  expect(calls.find((call) => call.section === "booking-history")).toEqual({
    section: "booking-history",
    options: { requireSubscription: true },
  });
});
