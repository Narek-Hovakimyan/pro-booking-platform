import net from "node:net";

export const VALID_NODE_ENVS = new Set(["development", "test", "production"]);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function makeFailure(variable, reason) {
  return { variable, reason };
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.+$/, "");
}

function parseIpv6Parts(hostname) {
  if (!hostname.includes(":")) return null;

  const halves = hostname.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missingCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missingCount < 0) return null;

  const parts = [...left, ...Array(missingCount).fill("0"), ...right];
  if (parts.length !== 8) return null;

  return parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return Number.NaN;
    return Number.parseInt(part, 16);
  });
}

function isIpv4MappedLoopback(hostname) {
  const parts = parseIpv6Parts(hostname);
  if (!parts || parts.some((part) => Number.isNaN(part))) return false;

  const isMappedPrefix =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (!isMappedPrefix) return false;

  const firstOctet = parts[6] >> 8;
  return firstOctet === 127;
}

function isLoopbackHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    return normalized.split(".")[0] === "127";
  }
  if (ipVersion === 6) {
    return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || isIpv4MappedLoopback(normalized);
  }

  return false;
}

function normalizeOrigin(value) {
  const rawOrigin = normalizeString(value);
  if (!rawOrigin) {
    return { origin: "", reason: "empty_origin" };
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    return { origin: "", reason: "malformed_origin" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { origin: "", reason: "unsupported_origin_protocol" };
  }

  if (parsed.username || parsed.password) {
    return { origin: "", reason: "origin_credentials_unsupported" };
  }

  if (
    (parsed.pathname && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    return { origin: "", reason: "origin_must_not_include_path" };
  }

  return { origin: parsed.origin, reason: "" };
}

export function parseClientOrigins(value) {
  const origins = normalizeString(value);
  return origins ? origins.split(",").map((origin) => origin.trim()) : [];
}

export class RuntimeConfigError extends Error {
  constructor(failures) {
    const summary = failures
      .map((failure) => `${failure.variable}:${failure.reason}`)
      .join(",");
    super(`Invalid runtime configuration: ${summary}`);
    this.name = "RuntimeConfigError";
    this.failures = failures.map(({ variable, reason }) => ({ variable, reason }));
  }
}

export function validateRuntimeConfig(env = process.env) {
  const failures = [];
  const nodeEnv = normalizeString(env.NODE_ENV);

  if (!nodeEnv) {
    failures.push(makeFailure("NODE_ENV", "missing"));
  } else if (!VALID_NODE_ENVS.has(nodeEnv)) {
    failures.push(makeFailure("NODE_ENV", "unsupported"));
  }

  const clientOrigins = parseClientOrigins(env.CLIENT_URL);
  const normalizedOrigins = [];

  for (const clientOrigin of clientOrigins) {
    const result = normalizeOrigin(clientOrigin);
    if (!result.origin) {
      failures.push(makeFailure("CLIENT_URL", result.reason));
      continue;
    }

    if (nodeEnv === "production" && isLoopbackHostname(new URL(result.origin).hostname)) {
      failures.push(makeFailure("CLIENT_URL", "localhost_or_loopback"));
      continue;
    }

    normalizedOrigins.push(result.origin);
  }

  const trustProxy = normalizeString(env.TRUST_PROXY);
  if (nodeEnv === "production") {
    if (normalizedOrigins.length === 0) {
      failures.push(makeFailure("CLIENT_URL", "missing"));
    }
    if (trustProxy !== "true") {
      failures.push(makeFailure("TRUST_PROXY", "required_true"));
    }
  }

  if (failures.length > 0) {
    throw new RuntimeConfigError(failures);
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    clientOrigins: normalizedOrigins,
    clientUrl: normalizedOrigins.join(","),
    trustProxy: trustProxy === "true",
  };
}

export function applyRuntimeConfig(config, env = process.env) {
  env.NODE_ENV = config.nodeEnv;
  env.CLIENT_URL = config.clientUrl;
  env.TRUST_PROXY = config.trustProxy ? "true" : normalizeString(env.TRUST_PROXY);
  return env;
}

export function loadRuntimeConfig(env = process.env) {
  const config = validateRuntimeConfig(env);
  applyRuntimeConfig(config, env);
  return config;
}
