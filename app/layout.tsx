import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./pricing/pricing.css";
import "./auth/auth.css";
import { SessionProvider } from "@/components/anvik/session-provider";
import { AppearanceProvider } from "@/components/anvik/appearance-provider";
import { ShaderBackground } from "@/components/ui/main-shader-for-ai";
// Vercel Web Analytics + Speed Insights — privacy-conscious, no cookies:
// no identifiers, no content, no raw IPs; just geo/page/performance.
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anvik.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ANVIK AI — One Mind. Infinite Possibilities.",
    template: "%s — ANVIK AI",
  },
  description:
    "ANVIK AI is your ultra-fast personal AI workspace — chat, code, image, voice, and vision in one calm, premium interface.",
  applicationName: "ANVIK AI",
  openGraph: {
    title: "ANVIK AI — One Mind. Infinite Possibilities.",
    description:
      "Chat, Code, Image, Voice, and Vision — one premium AI workspace.",
    type: "website",
    siteName: "ANVIK AI",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "ANVIK AI — One Mind. Infinite Possibilities.",
    description: "Chat, Code, Image, Voice, and Vision — one premium AI workspace.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07080c",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-appearance="dark" data-theme="dark">
      <body className="theme-shell min-h-dvh antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppearanceProvider>
          <ShaderBackground className="ambient-ring-host" />
          <div id="main-content">
            <SessionProvider>{children}</SessionProvider>
          </div>
        </AppearanceProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
