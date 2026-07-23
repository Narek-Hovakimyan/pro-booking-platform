import axios from "axios";
import { API_CREDENTIALS_CONFIG } from "./apiConfig";
import { getAccessToken } from "@/shared/auth/accessTokenStore";
import {
  applyRefreshedAuthSession,
  expireCurrentAuthSession,
  requestRefreshSession,
} from "./authSession";

const api = axios.create(API_CREDENTIALS_CONFIG);
const autoInjectedAuthorizationHeaders = new WeakSet();
const replayedAuthorizationHeaders = new WeakSet();

function hasAuthorizationHeader(headers) {
  if (!headers) {
    return false;
  }

  if (typeof headers.has === "function") {
    return headers.has("Authorization");
  }

  return Object.keys(headers).some(
    (headerName) => headerName.toLowerCase() === "authorization"
  );
}

function setAuthorizationHeader(headers, value) {
  if (typeof headers.set === "function") {
    headers.set("Authorization", value);
    return;
  }

  headers.Authorization = value;
}

function getAuthorizationHeader(headers) {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === "function") {
    return headers.get("Authorization");
  }

  const headerName = Object.keys(headers).find(
    (name) => name.toLowerCase() === "authorization"
  );

  return headerName ? headers[headerName] : null;
}

function removeContentTypeForFormData(headers) {
  if (!headers) {
    return;
  }

  if (typeof headers.delete === "function") {
    headers.delete("Content-Type");
    return;
  }

  Object.keys(headers).forEach((headerName) => {
    if (headerName.toLowerCase() === "content-type") {
      delete headers[headerName];
    }
  });
}

function isAuthRequest(url) {
  return typeof url === "string" && /(^|\/)auth(\/|$)/.test(url);
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  config.headers = config.headers || {};

  if (token && !hasAuthorizationHeader(config.headers)) {
    setAuthorizationHeader(config.headers, `Bearer ${token}`);
    autoInjectedAuthorizationHeaders.add(config.headers);
  } else {
    autoInjectedAuthorizationHeaders.delete(config.headers);
  }

  if (config.data instanceof FormData) {
    removeContentTypeForFormData(config.headers);
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error || {};

    if (
      response?.status !== 401 ||
      !config ||
      replayedAuthorizationHeaders.has(config.headers) ||
      !autoInjectedAuthorizationHeaders.has(config.headers) ||
      isAuthRequest(config.url)
    ) {
      throw error;
    }

    try {
      const session = await requestRefreshSession();
      await applyRefreshedAuthSession(session);
    } catch (refreshError) {
      if (
        refreshError?.response?.status === 401 ||
        refreshError?.code === "AUTH_SESSION_INVALID_RESPONSE"
      ) {
        await expireCurrentAuthSession();
      }

      throw error;
    }

    const retriedConfig = {
      ...config,
      headers: config.headers,
    };
    replayedAuthorizationHeaders.add(retriedConfig.headers);

    const nextToken = getAccessToken();
    const existingAuthorization = getAuthorizationHeader(retriedConfig.headers);

    if (
      autoInjectedAuthorizationHeaders.has(retriedConfig.headers) &&
      nextToken &&
      typeof existingAuthorization === "string" &&
      existingAuthorization.startsWith("Bearer ")
    ) {
      setAuthorizationHeader(retriedConfig.headers, `Bearer ${nextToken}`);
    }

    return api.request(retriedConfig);
  }
);

export default api;
