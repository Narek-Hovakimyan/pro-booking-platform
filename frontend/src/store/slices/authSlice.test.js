import { describe, expect, test } from "vitest";

import authReducer, {
  loginUser,
  logoutUser,
  registerUser,
  updateCurrentUser,
} from "./authSlice";

const user = {
  id: "user-1",
  name: "Auth User",
  role: "barber",
  salonId: "507f1f77bcf86cd799439011",
};

describe("authSlice", () => {
  test("initial state is unauthenticated", () => {
    expect(authReducer(undefined, { type: "unknown" })).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
  });

  test.each([
    ["loginUser", loginUser],
    ["registerUser", registerUser],
  ])("%s stores exact user/token and authenticates only when both exist", (_name, actionCreator) => {
    expect(authReducer(undefined, actionCreator({ user, token: "token-1" }))).toEqual({
      currentUser: user,
      token: "token-1",
      isAuthenticated: true,
    });

    expect(authReducer(undefined, actionCreator({ token: "token-1" }))).toEqual({
      currentUser: undefined,
      token: "token-1",
      isAuthenticated: false,
    });

    expect(authReducer(undefined, actionCreator({ user }))).toEqual({
      currentUser: user,
      token: undefined,
      isAuthenticated: false,
    });
  });

  test("logoutUser clears the authenticated session", () => {
    const authenticatedState = {
      currentUser: user,
      token: "token-1",
      isAuthenticated: true,
    };

    expect(authReducer(authenticatedState, logoutUser())).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
  });

  test("updateCurrentUser merges fields and preserves token/authenticated state", () => {
    const authenticatedState = {
      currentUser: {
        id: "user-1",
        name: "Before",
        role: "barber",
        phone: "555-0000",
      },
      token: "token-1",
      isAuthenticated: true,
    };

    expect(
      authReducer(
        authenticatedState,
        updateCurrentUser({ name: "After", salonStatus: "approved" })
      )
    ).toEqual({
      currentUser: {
        id: "user-1",
        name: "After",
        role: "barber",
        phone: "555-0000",
        salonStatus: "approved",
      },
      token: "token-1",
      isAuthenticated: true,
    });
  });

  test("updateCurrentUser does nothing when there is no current user", () => {
    expect(
      authReducer(
        { currentUser: null, token: "token-1", isAuthenticated: false },
        updateCurrentUser({ name: "Ignored" })
      )
    ).toEqual({
      currentUser: null,
      token: "token-1",
      isAuthenticated: false,
    });
  });
});
