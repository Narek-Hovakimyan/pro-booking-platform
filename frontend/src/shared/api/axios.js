import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Hairbook-CSRF": "1",
  },
});

function getStoredToken() {
  try {
    const serializedState = localStorage.getItem("hairbook-redux-state");

    if (!serializedState) {
      return null;
    }

    return JSON.parse(serializedState)?.auth?.token ?? null;
  } catch {
    return null;
  }
}

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

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  config.headers = config.headers || {};

  if (token && !hasAuthorizationHeader(config.headers)) {
    setAuthorizationHeader(config.headers, `Bearer ${token}`);
  }

  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === "function") {
      config.headers.delete("Content-Type");
    } else {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }
  }

  return config;
});

export default api;
