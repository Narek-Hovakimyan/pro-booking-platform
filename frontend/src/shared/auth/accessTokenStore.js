let accessToken = null;

function normalizeAccessToken(token) {
  return typeof token === "string" && token.trim() ? token : null;
}

export function initializeAccessToken(token) {
  accessToken = normalizeAccessToken(token);
  return accessToken;
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = normalizeAccessToken(token);
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}
