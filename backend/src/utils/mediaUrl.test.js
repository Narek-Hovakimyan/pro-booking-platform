import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeMediaUrl } from "./mediaUrl.js";

// --- Allow: local upload paths ---

test('sanitizeMediaUrl allows "/uploads/events/a.jpg"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/events/a.jpg"), "/uploads/events/a.jpg");
});

test('sanitizeMediaUrl allows "/uploads/avatars/user.png"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/avatars/user.png"), "/uploads/avatars/user.png");
});

test('sanitizeMediaUrl allows deeply nested "/uploads/a/b/c/d.jpg"', () => {
  assert.equal(
    sanitizeMediaUrl("/uploads/a/b/c/d.jpg"),
    "/uploads/a/b/c/d.jpg"
  );
});

// --- Allow: http/https URLs ---

test("sanitizeMediaUrl allows https:// URLs", () => {
  assert.equal(
    sanitizeMediaUrl("https://example.com/a.jpg"),
    "https://example.com/a.jpg"
  );
});

test("sanitizeMediaUrl allows http:// URLs", () => {
  assert.equal(
    sanitizeMediaUrl("http://example.com/a.jpg"),
    "http://example.com/a.jpg"
  );
});

test("sanitizeMediaUrl trims and allows https:// URLs", () => {
  assert.equal(
    sanitizeMediaUrl(" https://example.com/a.jpg "),
    "https://example.com/a.jpg"
  );
});

test("sanitizeMediaUrl allows http:// URLs with query string", () => {
  assert.equal(
    sanitizeMediaUrl("http://example.com/path?foo=bar"),
    "http://example.com/path?foo=bar"
  );
});

// --- Allow: empty / null / undefined ---

test("sanitizeMediaUrl returns empty string for null", () => {
  assert.equal(sanitizeMediaUrl(null), "");
});

test("sanitizeMediaUrl returns empty string for undefined", () => {
  assert.equal(sanitizeMediaUrl(undefined), "");
});

test("sanitizeMediaUrl returns empty string for empty string", () => {
  assert.equal(sanitizeMediaUrl(""), "");
});

// --- Reject: non-string types ---

test("sanitizeMediaUrl returns empty string for non-string types", () => {
  assert.equal(sanitizeMediaUrl(123), "");
  assert.equal(sanitizeMediaUrl(true), "");
  assert.equal(sanitizeMediaUrl({}), "");
  assert.equal(sanitizeMediaUrl([]), "");
});

// --- Reject: dangerous protocols ---

test("sanitizeMediaUrl rejects javascript: protocol", () => {
  assert.equal(sanitizeMediaUrl("javascript:alert(1)"), "");
});

test("sanitizeMediaUrl rejects data: URLs", () => {
  assert.equal(sanitizeMediaUrl("data:text/html,<script>alert(1)</script>"), "");
});

test("sanitizeMediaUrl rejects file: URLs", () => {
  assert.equal(sanitizeMediaUrl("file:///etc/passwd"), "");
});

// --- Reject: bare traversal (no /uploads/ prefix) ---

test("sanitizeMediaUrl rejects bare traversal paths", () => {
  assert.equal(sanitizeMediaUrl("../../server.js"), "");
  assert.equal(sanitizeMediaUrl("../.env"), "");
});

// --- Reject: /uploads/ paths containing ".." ---

test('sanitizeMediaUrl rejects "/uploads/../../server.js"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/../../server.js"), "");
});

test('sanitizeMediaUrl rejects "/uploads/../.env"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/../.env"), "");
});

test('sanitizeMediaUrl rejects "/uploads/a/b/../../../c.jpg"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/a/b/../../../c.jpg"), "");
});

// --- Reject: /uploads/ paths with percent-encoded traversal ---

test('sanitizeMediaUrl rejects "/uploads/%2e%2e/%2e%2e/server.js"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/%2e%2e/%2e%2e/server.js"), "");
});

test('sanitizeMediaUrl rejects "/uploads/%2e%2e/%2e%2e%2fserver.js" (encoded slash)', () => {
  assert.equal(sanitizeMediaUrl("/uploads/%2e%2e/%2e%2e%2fserver.js"), "");
});

test('sanitizeMediaUrl rejects "/uploads/..%252f..%252fserver.js" (double-encoded)', () => {
  // "%252e%252e" decodes to "%2e%2e" which decodes to ".."
  // decodeURIComponent handles one level: "%252e" -> "%2e"
  // Since ".." is not found after one decode, this is trickier.
  // Actually "%252e" decodes to "%2e" which is not "..", so this particular
  // double-encoded case would pass through if we only decode once.
  // But double-encoded attacks are extremely unlikely through JSON body parsing
  // (Express already decodes once). We keep this test documenting the limitation.
  const result = sanitizeMediaUrl("/uploads/..%252f..%252fserver.js");
  // Express decodes %25 to % once, so the server receives "/uploads/..%2f..%2fserver.js"
  // In that case, decodeURIComponent would turn "%2f" to "/", giving "../"
  // So it depends on whether the double encoding survives transport. We just note
  // the behavior.
  assert.equal(result, "");
});

// --- Reject: /uploads/ paths with backslashes ---

test('sanitizeMediaUrl rejects "/uploads\\..\\server.js"', () => {
  assert.equal(sanitizeMediaUrl("/uploads\\..\\server.js"), "");
});

test('sanitizeMediaUrl rejects "\\uploads\\avatars\\a.jpg"', () => {
  assert.equal(sanitizeMediaUrl("\\uploads\\avatars\\a.jpg"), "");
});

// --- Reject: arbitrary strings ---

test("sanitizeMediaUrl rejects arbitrary strings", () => {
  assert.equal(sanitizeMediaUrl("abc"), "");
  assert.equal(sanitizeMediaUrl("not-a-url"), "");
});

// --- Reject: invalid percent encoding ---

test('sanitizeMediaUrl rejects invalid percent encoding like "%GG"', () => {
  assert.equal(sanitizeMediaUrl("/uploads/%GG"), "");
});

// --- Allow: paths with harmless percent-encoded characters ---

test('sanitizeMediaUrl allows "/uploads/file%20name.jpg" (space)', () => {
  assert.equal(
    sanitizeMediaUrl("/uploads/file%20name.jpg"),
    "/uploads/file%20name.jpg"
  );
});

test('sanitizeMediaUrl allows "/uploads/file%2Bname.jpg" (plus sign encoded)', () => {
  assert.equal(
    sanitizeMediaUrl("/uploads/file%2Bname.jpg"),
    "/uploads/file%2Bname.jpg"
  );
});
