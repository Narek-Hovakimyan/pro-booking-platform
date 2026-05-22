const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ||
  (import.meta.env.DEV
    ? "http://localhost:5000"
    : globalThis.location?.origin || "");

export function getMediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;

  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}
