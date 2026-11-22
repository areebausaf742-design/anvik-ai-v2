/** @type {import('next').NextConfig} */

// The browser talks to the Supabase auth/REST API directly for session
// flows (PKCE exchange, session refresh, current user). The CSP must allow
// that origin or every browser-side auth call is blocked and sign-in fails
// with "Could not reach the sign-in service." (the audit CSP fix scoped
// connect-src to the AI origins but missed the account API entirely).
// Derived from the environment so preview deploys and other projects work;
// when unconfigured the auth client never runs anyway (authEnabled()).
function supabaseOrigin() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

function connectSrc() {
  const values = [
    "'self'",
    "https://generativelanguage.googleapis.com",
    "https://image.pollinations.ai",
  ];
  const supabase = supabaseOrigin();
  if (supabase) values.push(supabase);
  return values.join(" ");
}

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    // Generated images are served by the free Flux endpoint as absolute URLs.
    remotePatterns: [
      { protocol: "https", hostname: "image.pollinations.ai" },
      { protocol: "https", hostname: "*.pollinations.ai" },
    ],
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      {
        // The app renders model output as React nodes, never as HTML, so
        // script-src needs no unsafe-inline for markdown. These origins are
        // exactly what the client talks to at runtime.
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://image.pollinations.ai",
          "font-src 'self' data:",
          `connect-src ${connectSrc()}`,
          "frame-src 'self' data: blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    return [{ source: "/(.*)", headers: security }];
  },
};

export default nextConfig;
