import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
export const metadata: Metadata = { title: "Voice mode", description: "Speak naturally and explore your ideas with ANVIK AI." };
export default function VoicePage() { return <CreativeStudio kind="voice" />; }
