import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import Navigation from "@/components/anvik/navigation";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anvik.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ANVIK AI — One Mind. Infinite Possibilities.",
    template: "%s — ANVIK AI",
  },
  description:
    "ANVIK AI is your dark, ultra-fast personal AI workspace powered by Gemini — chat, code lab, image studio, voice mode, and vision.",
  applicationName: "ANVIK AI",
  openGraph: {
    title: "ANVIK AI — One Mind. Infinite Possibilities.",
    description:
      "Chat, Code Lab, Image Studio, Voice, and Vision — live streaming powered by Gemini.",
    type: "website",
    siteName: "ANVIK AI",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "ANVIK AI — One Mind. Infinite Possibilities.",
    description: "Chat, Code Lab, Image Studio, Voice, and Vision — powered by Gemini.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050508",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className="dark"
      style={{ backgroundColor: "#050508", color: "#f8fafc" }}
    >
      <body className="min-h-dvh bg-[#050508] text-slate-100 antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Navigation />
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
