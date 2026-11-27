import type { Metadata } from "next";
import { Hero } from "@/components/anvik/landing/hero";
import { ModeShowcase } from "@/components/anvik/landing/showcase";
import { LandingFooter } from "@/components/anvik/landing/footer";

export const metadata: Metadata = {
  title: "ANVIK AI — Ask anything. Get instant, intelligent answers.",
  description:
    "ANVIK AI is a calm, confident personal workspace for questions, code, images and vision — in English, Hindi or Hinglish. Ten free questions a day; sign in to keep your history, credits and consent.",
  openGraph: {
    title: "ANVIK AI — Ask anything. Get instant, intelligent answers.",
    description:
      "ANVIK AI is a calm, confident personal workspace for questions, code, images and vision.",
    type: "website",
  },
};

export default function Home() {
  return (
    <main className="public-page" id="main-content">
      <Hero />
      <ModeShowcase />
      <LandingFooter />
    </main>
  );
}
