import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

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
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ backgroundColor: "#FFFFFF", color: "#1A1A1A" }}>
      <body className="min-h-dvh bg-white text-[#1A1A1A] antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
