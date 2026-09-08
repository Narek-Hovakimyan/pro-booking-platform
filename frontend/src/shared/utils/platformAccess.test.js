import { describe, expect, test } from "vitest";

import {
  canManagePlatformBilling,
  canReadPlatformBilling,
  canReadPlatformAudit,
  canAccessPlatform,
  hasPlatformCapability,
} from "./platformAccess";

describe("platform capability access", () => {
  test("preserves canAccessPlatform and supports legacy privileged sessions", () => {
    const legacyPlatformUser = { canAccessPlatform: true };

    expect(canAccessPlatform(legacyPlatformUser)).toBe(true);
    expect(hasPlatformCapability(legacyPlatformUser, "billing.read")).toBe(true);
    expect(hasPlatformCapability(legacyPlatformUser, "billing.manage")).toBe(true);
    expect(canReadPlatformBilling(legacyPlatformUser)).toBe(true);
    expect(canManagePlatformBilling(legacyPlatformUser)).toBe(true);
    expect(canReadPlatformAudit(legacyPlatformUser)).toBe(true);
  });

  test("uses explicit capabilities when the auth response supplies them", () => {
    const readOnlyUser = {
      canAccessPlatform: true,
      platformCapabilities: ["billing.read"],
    };

    expect(hasPlatformCapability(readOnlyUser, "billing.read")).toBe(true);
    expect(hasPlatformCapability(readOnlyUser, "billing.manage")).toBe(false);
    expect(hasPlatformCapability(readOnlyUser, "unknown.capability")).toBe(false);
    expect(canReadPlatformBilling(readOnlyUser)).toBe(true);
    expect(canManagePlatformBilling(readOnlyUser)).toBe(false);
    expect(canReadPlatformAudit(readOnlyUser)).toBe(false);
  });

  test("denies non-platform users", () => {
    expect(hasPlatformCapability({ canAccessPlatform: false }, "billing.read")).toBe(false);
    expect(
      hasPlatformCapability(
        { canAccessPlatform: false, platformCapabilities: ["billing.read"] },
        "billing.read"
      )
    ).toBe(false);
    expect(hasPlatformCapability(null, "billing.read")).toBe(false);
  });
});
