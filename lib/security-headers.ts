/**=============================================================================
 * ANVIK AI — Security Headers Middleware (Enterprise Security)
 * ============================================================================
 * Adds comprehensive security headers to all responses.
 * Prevents XSS, clickjacking, content type sniffing, and other attacks.
 * ==========================================================================*/

/**
 * Security headers to apply to all responses.
 * Follows OWASP-recommended headers for web application security.
 */
export const securityHeaders: Record<string, string> = {
  /** Prevents MIME type sniffing */
  "x-content-type-options": "nosniff",

  /** Prevents XSS in older browsers */
  "x-xss-protection": "1; mode=block",

  /** Prevents the page from being embedded in frames (clickjacking) */
  "x-frame-options": "DENY",

  /** Referrer policy - only send referrer when navigating to same-origin */
  "referrer-policy": "origin-when-cross-origin",

  /** Content Security Policy - restricts sources of executable scripts */
  "content-security-policy": defaultCsp(),

  /** Permits only secure cookies */
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",

  /** Reduces information leakage */
  "x-permitted-cross-domain-policies": "none",

  /** Hide server information */
  "x-powered-by": "undefined",
};

/** Default CSP that allows ANVIK's resources and Supabase */
function defaultCsp(): string {
  // Allow self, data URLs, and trusted sources
  return (
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'" +
    "// Allow images from self and data:" +
    " img-src 'self' data: https:" +
    "// Allow scripts from self only:" +
    " script-src 'self' " +
    "// Allow connect to Supabase and Gemini:" +
    " connect-src 'self' https://*.supabase.co https://*.googleapis.com" +
    "// Allow fonts from self:" +
    " font-src 'self' data:" +
    "// Allow style from self:" +
    " style-src 'self' 'unsafe-inline'" +
    "// Allow frame-ancestors to prevent framing:" +
    " frame-ancestors 'none'" +
    "// Allow object media:" +
    " object-src 'none'"
  );
}

/** CSP for development mode - more permissive */
function developmentCsp(): string {
  return (
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: data: " +
    "img-src 'self' data: https: http: " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' ws: " +
    "connect-src 'self' ws: " +
    "font-src 'self' data: " +
    "style-src 'self' 'unsafe-inline'"
  );
}

/** Apply security headers to a Next.js Response */
export function applySecurityHeaders(
  response: Response,
  options: {
    /** Override the CSP */
    csp?: string;
    /** Set to false to skip HSTS */
    hsts?: boolean;
    /** Set to false to skip frame options */
    frameOptions?: boolean;
  } = {},
): Response {
  const {
    csp: customCsp,
    hsts = true,
    frameOptions = true,
  } = options;

  const headers = new Headers(response.headers);

  // Apply all security headers
  for (const [key, value] of Object.entries(securityHeaders)) {
    // Skip if custom CSP is provided and we're setting content-security-policy
    if (key === "content-security-policy" && customCsp) {
      headers.set(key, customCsp);
    } else if (key !== "content-security-policy") {
      headers.set(key, value);
    }
  }

  // Apply custom CSP if provided
  if (customCsp) {
    headers.set("content-security-policy", customCsp);
  }

  // Conditionally apply HSTS
  if (hsts) {
    headers.set("strict-transport-security", securityHeaders["strict-transport-security"]);
  }

  // Conditionally apply frame options
  if (frameOptions) {
    headers.set("x-frame-options", securityHeaders["x-frame-options"]);
  }

  return new Response(headers.get("x-frame-options") ? undefined : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Simplified security headers for edge/vercel deployment */
export function edgeSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  // Minimal edge-compatible security headers
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "origin-when-cross-origin");
  headers.set("content-security-policy", defaultCsp());
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  headers.set("x-frame-options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}