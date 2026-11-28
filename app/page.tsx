import type { Metadata } from "next";
import { Hero } from "@/components/anvik/landing/hero";
import { ModeShowcase } from "@/components/anvik/landing/showcase";
import { LandingFooter } from "@/components/anvik/landing/footer";
import { StorySection } from "@/components/anvik/landing/story";

export const metadata: Metadata = {
  title: "ANVIK AI — Start with a thought. Leave with momentum.",
  description:
    "A thoughtful AI workspace for chat, code, images, voice and vision. Ask in English, Hindi or Hinglish—no account required to begin.",
  openGraph: {
    title: "ANVIK AI — Start with a thought. Leave with momentum.",
    description:
      "A thoughtful AI workspace for chat, code, images, voice and vision. Ask in English, Hindi or Hinglish.",
    type: "website",
  },
};

export default function Home() {
  return (
    <main className="public-page" id="main-content">
      <Hero />
      <ModeShowcase />
      <StorySection />
      <LandingFooter />
    </main>
  );
}
