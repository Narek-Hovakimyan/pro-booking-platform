/**
 * Sanitize user-supplied media URL values.
 *
 * Allows:
 *   - empty string
 *   - safe local upload paths under "/uploads/" (no traversal, no backslashes)
 *   - http:// or https:// URLs (validated via new URL())
 *
 * Rejects everything else (javascript:, data:, file:, traversal paths, "abc", etc.).
 */
export const sanitizeMediaUrl = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (trimmed === "") return "";

  // Allow local upload paths: /uploads/...
  if (trimmed.startsWith("/uploads/")) {
    // Reject backslashes
    if (trimmed.includes("\\")) return "";

    // Decode percent-encoded characters repeatedly to catch double encoding
    let decoded = trimmed;
    for (let i = 0; i < 3; i++) {
      const prev = decoded;
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        // Invalid percent encoding — reject
        return "";
      }
      if (decoded === prev) break; // no more decoding possible
    }


    // After decoding, verify the path still starts with "/uploads/"
    if (!decoded.startsWith("/uploads/")) return "";

    // Split into segments and reject any segment that is ".."
    const segments = decoded.split("/");
    for (const segment of segments) {
      if (segment === "..") return "";
    }

    return trimmed;
  }

  // Allow valid http/https URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    // not a valid URL
  }

  return "";
};
