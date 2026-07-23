import axios from "axios";

import { API_CREDENTIALS_CONFIG } from "./apiConfig";
import {
  clearAccessToken,
  setAccessToken,
} from "@/shared/auth/accessTokenStore";

const authSessionApi = axios.create(API_CREDENTIALS_CONFIG);

let refreshSessionPromise = null;
let authSessionHandlers = {
  onRefresh: null,
  onExpire: null,
};

function isValidAuthSession(session) {
  const user = session?.user;

  return Boolean(
    session &&
      typeof session === "object" &&
      !Array.isArray(session) &&
      typeof session.token === "string" &&
      session.token.trim() &&
      user &&
      typeof user === "object" &&
      !Array.isArray(user)
  );
}

function invalidAuthSessionError() {
  const error = new Error("Invalid authentication session response.");
  error.code = "AUTH_SESSION_INVALID_RESPONSE";
  return error;
}

export function configureAuthSessionHandlers(handlers = {}) {
  authSessionHandlers = {
    onRefresh:
      typeof handlers.onRefresh === "function" ? handlers.onRefresh : null,
    onExpire:
      typeof handlers.onExpire === "function" ? handlers.onExpire : null,
  };
}

export function resetAuthSessionHandlers() {
  authSessionHandlers = { onRefresh: null, onExpire: null };
}

export async function requestRefreshSession() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = authSessionApi
      .post("/auth/refresh")
      .then(({ data }) => {
        if (!isValidAuthSession(data)) {
          throw invalidAuthSessionError();
        }

        return data;
      })
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

export async function requestLogoutSession() {
  return authSessionApi.post("/auth/logout");
}

export async function applyRefreshedAuthSession(session) {
  if (!isValidAuthSession(session)) {
    clearAccessToken();
    throw invalidAuthSessionError();
  }

  const token = setAccessToken(session.token);

  if (!token) {
    throw invalidAuthSessionError();
  }

  try {
    await authSessionHandlers.onRefresh?.(session);
    return session;
  } catch (error) {
    clearAccessToken();
    throw error;
  }
}

export async function expireCurrentAuthSession() {
  clearAccessToken();
  await authSessionHandlers.onExpire?.();
}
