export type JsonBody = Record<string, unknown>;

export function jsonResponse(
  statusCode: number,
  body: JsonBody,
  extraHeaders: Record<string, string> = {},
) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Same-site / origin checks for the public Buy Now endpoint.
 * Allows requests with no Origin (same-origin navigations rarely send it for fetch
 * from same site with cors mode) when Referer matches, or Origin matches SITE_URL.
 */
export function isAllowedCheckoutOrigin(event: {
  headers: Record<string, string | undefined>;
}): boolean {
  const siteUrl = (process.env.URL || process.env.SITE_URL || "").replace(
    /\/$/,
    "",
  );
  const allowed = new Set<string>();
  if (siteUrl) allowed.add(siteUrl);
  // Local Netlify Dev / Vite
  allowed.add("http://localhost:8888");
  allowed.add("http://127.0.0.1:8888");
  allowed.add("http://localhost:5173");
  allowed.add("http://127.0.0.1:5173");

  const headers = normalizeHeaders(event.headers);
  const origin = headers.origin;
  const referer = headers.referer;

  if (origin) {
    return [...allowed].some((a) => origin === a || origin.startsWith(`${a}/`));
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return [...allowed].some((a) => refOrigin === a);
    } catch {
      return false;
    }
  }

  // Deny when we cannot establish same-site context in production.
  if (
    process.env.CONTEXT === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return false;
  }

  // In local/dev without Origin/Referer, allow so tests and curl work.
  return true;
}

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export function getHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}
