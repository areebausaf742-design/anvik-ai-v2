import type { Metadata } from "next";
import OnboardingFlow from "@/components/anvik/onboarding-flow";

export const metadata: Metadata = { title: "Getting started", description: "Set up your ANVIK AI account." };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
