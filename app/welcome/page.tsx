import type { Metadata } from "next";
import WelcomeScreen from "@/components/anvik/welcome-screen";

export const metadata: Metadata = { title: "Welcome", description: "Welcome to ANVIK AI." };

export default function WelcomePage() {
  return <WelcomeScreen />;
}
