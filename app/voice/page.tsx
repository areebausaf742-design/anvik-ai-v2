import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
import SelfHealingBoundary from "@/components/anvik/self-healing-boundary";
export const metadata: Metadata = { title: "Voice mode", description: "Speak naturally and explore your ideas with ANVIK AI." };
export default function VoicePage() { return <SelfHealingBoundary route="/voice"><CreativeStudio kind="voice" /></SelfHealingBoundary>; }
