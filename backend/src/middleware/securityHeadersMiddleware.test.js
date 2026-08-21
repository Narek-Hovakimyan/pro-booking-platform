import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cors from "cors";
import {
  createSecurityHeadersMiddleware,
  publicMediaResourcePolicy,
} from "./securityHeadersMiddleware.js";

const createResponse = () => {
  const headers = new Map();
  const writes = new Map();

  return {
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    getHeaderNames() {
      return [...headers.keys()];
    },
    removeHeader(name) {
      headers.delete(name.toLowerCase());
    },
    setHeader(name, value) {
      const key = name.toLowerCase();
      headers.set(key, value);
      writes.set(key, (writes.get(key) || 0) + 1);
    },
    writes,
  };
};

const runMiddleware = (middleware, response = createResponse(), request = {}) =>
  new Promise((resolve, reject) => {
    middleware(request, response, (error) => {
      if (error) reject(error);
      else resolve(response);
    });
  });

test("normal API and health responses receive the preserved and safe default headers", async () => {
  const response = await runMiddleware(
    createSecurityHeadersMiddleware({ isProduction: false })
  );

  assert.equal(response.getHeader("X-Content-Type-Options"), "nosniff");
  assert.equal(response.getHeader("X-Frame-Options"), "DENY");
  assert.equal(
    response.getHeader("Referrer-Policy"),
    "strict-origin-when-cross-origin"
  );
  assert.equal(
    response.getHeader("Permissions-Policy"),
    "camera=(), microphone=(), geolocation=()"
  );
  assert.equal(response.getHeader("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(response.getHeader("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(response.getHeader("Origin-Agent-Cluster"), "?1");
  assert.equal(response.getHeader("X-DNS-Prefetch-Control"), "off");
  assert.equal(response.getHeader("X-Download-Options"), "noopen");
  assert.equal(response.getHeader("X-Permitted-Cross-Domain-Policies"), "none");
  assert.equal(response.getHeader("X-XSS-Protection"), "0");
  assert.equal(response.getHeader("X-Powered-By"), undefined);
  assert.equal(response.getHeader("Strict-Transport-Security"), undefined);
  assert.equal(response.getHeader("Content-Security-Policy"), undefined);
  assert.equal(response.getHeader("Cross-Origin-Embedder-Policy"), undefined);
});

test("production HSTS preserves the existing one-year non-preload policy", async () => {
  const response = await runMiddleware(
    createSecurityHeadersMiddleware({ isProduction: true })
  );

  assert.equal(
    response.getHeader("Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains"
  );
});

test("public media overrides only CORP without duplicating response values", async () => {
  const response = await runMiddleware(
    createSecurityHeadersMiddleware({ isProduction: false })
  );
  await runMiddleware(publicMediaResourcePolicy, response);

  assert.equal(response.getHeader("Cross-Origin-Resource-Policy"), "cross-origin");
  assert.equal(Array.isArray(response.getHeader("Cross-Origin-Resource-Policy")), false);
  assert.equal(response.getHeader("Access-Control-Allow-Origin"), undefined);
  assert.equal(response.getHeader("Cross-Origin-Embedder-Policy"), undefined);
});

test("each final security header has one value and custom headers are not duplicated", async () => {
  const response = await runMiddleware(
    createSecurityHeadersMiddleware({ isProduction: true })
  );

  for (const name of response.getHeaderNames()) {
    assert.equal(Array.isArray(response.getHeader(name)), false, name);
  }
  assert.equal(response.writes.get("permissions-policy"), 1);
  assert.equal(response.writes.get("referrer-policy"), 1);
  assert.equal(response.writes.get("x-frame-options"), 1);
  assert.equal(response.writes.get("x-content-type-options"), 1);
  assert.equal(response.writes.get("strict-transport-security"), 1);
});

test("server installs security headers before CORS and scopes public CORP overrides", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
  const securityUse = "app.use(createSecurityHeadersMiddleware({ isProduction }));";

  assert.ok(serverSource.indexOf(securityUse) >= 0);
  assert.ok(serverSource.indexOf(securityUse) < serverSource.indexOf("app.use(cors(corsOptions));"));

  const eventRouteStart = serverSource.indexOf('"/uploads/events"');
  const eventStaticUse = serverSource.indexOf("express.static", eventRouteStart);
  assert.ok(eventRouteStart >= 0);
  assert.ok(serverSource.indexOf("publicMediaResourcePolicy", eventRouteStart) < eventStaticUse);

  assert.match(
    serverSource,
    /app\.get\(\s*"\/uploads\/:kind\(avatars\|certifications\)\/:filename",\s*publicMediaResourcePolicy,\s*serveProfileMedia\s*\)/
  );
  assert.match(
    serverSource,
    /app\.get\(\s*"\/uploads\/certificate-files\/:filename",\s*publicMediaResourcePolicy,\s*serveEventCertificateMedia\s*\)/
  );

  assert.match(
    serverSource,
    /app\.get\(\s*"\/uploads\/portfolio\/:filename",\s*publicMediaResourcePolicy,\s*servePublicPortfolioImage\s*\)/
  );
  assert.doesNotMatch(serverSource, /app\.use\(\s*"\/api[^\n]*publicMediaResourcePolicy/);
  assert.ok(serverSource.indexOf(securityUse) < serverSource.indexOf('app.use("/api/health"'));
});

test("headers remain available when a later CORS middleware rejects a request", async () => {
  const response = await runMiddleware(
    createSecurityHeadersMiddleware({ isProduction: false })
  );
  const rejectingCors = cors({
    origin(_origin, callback) {
      callback(new Error("Not allowed by CORS"));
    },
  });

  await assert.rejects(
    runMiddleware(rejectingCors, response, {
      headers: { origin: "https://hostile.example" },
      method: "GET",
    }),
    /Not allowed by CORS/
  );
  assert.equal(response.getHeader("X-Frame-Options"), "DENY");
  assert.equal(response.getHeader("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(response.getHeader("Content-Security-Policy"), undefined);
});
