export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");

export const API_DEFAULT_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Hairbook-CSRF": "1",
};

export const API_CREDENTIALS_CONFIG = {
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: API_DEFAULT_HEADERS,
};
