import { beforeEach, describe, expect, test } from "vitest";

import {
  clearAccessToken,
  getAccessToken,
  initializeAccessToken,
  setAccessToken,
} from "./accessTokenStore";

describe("accessTokenStore", () => {
  beforeEach(() => {
    clearAccessToken();
  });

  test("stores only non-empty string tokens in memory", () => {
    expect(initializeAccessToken("token-1")).toBe("token-1");
    expect(getAccessToken()).toBe("token-1");

    expect(setAccessToken("   ")).toBeNull();
    expect(getAccessToken()).toBeNull();

    expect(setAccessToken(null)).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  test("clears memory tokens explicitly", () => {
    setAccessToken("token-2");
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });
});
