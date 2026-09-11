// ============================================================================
// Security response headers (OWASP secure-headers baseline).
//
// Applied to every document/API response through a request middleware in
// src/start.ts. Notes on deliberate omissions:
//  - No `X-Frame-Options`/`frame-ancestors: none`: the app is rendered inside
//    the Lovable editor preview iframe. Clickjacking is instead constrained by
//    the configurable allow-list below.
//  - No `Content-Encoding` handling: the hosting edge compresses responses.
// ============================================================================

const DEFAULT_FRAME_ANCESTORS = "'self' https://*.lovable.app https://*.lovable.dev";

function frameAncestors(): string {
  const configured = process.env["SECURITY_FRAME_ANCESTORS"];
  return configured && configured.length > 0 ? configured : DEFAULT_FRAME_ANCESTORS;
}

/**
 * Content-Security-Policy. `'unsafe-inline'`/`'unsafe-eval'` are required by
 * the SSR hydration bootstrap and TensorFlow.js kernel compilation; everything
 * else is locked to same-origin plus the explicitly configured API origins.
 */
function contentSecurityPolicy(): string {
  const connect = [
    "'self'",
    process.env["SUPABASE_URL"] ?? "",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    process.env["MARKET_REST_URL"] ?? "",
    process.env["MARKET_WS_URL"] ?? "",
    "https://ai.gateway.lovable.dev",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors()}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "worker-src 'self' blob:",
    `connect-src ${connect}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "cross-origin-resource-policy": "same-site",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

/** Mutates the given response, adding security headers without clobbering. */
export function applySecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  if (!response.headers.has("content-security-policy")) {
    response.headers.set("content-security-policy", contentSecurityPolicy());
  }
  return response;
}
