import type { Metadata } from "next";
import { Hero } from "@/components/anvik/landing/hero";
import { ModeShowcase } from "@/components/anvik/landing/showcase";
import { LandingFooter } from "@/components/anvik/landing/footer";

export const metadata: Metadata = {
  title: "ANVIK AI — Find your next step",
  description:
    "A calm workspace for answers, code, images and vision — in English, Hindi or Hinglish. Start with ten free questions a day, no account required.",
  openGraph: {
    title: "ANVIK AI — Find your next step",
    description:
      "A calm workspace for answers, code, images and vision — in English, Hindi or Hinglish.",
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
