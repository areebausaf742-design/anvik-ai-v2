import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
import SelfHealingBoundary from "@/components/anvik/self-healing-boundary";
export const metadata: Metadata = { title: "Code lab", description: "Sketch, reason through, and create code with ANVIK AI." };
export default function CodePage() { return <SelfHealingBoundary route="/code"><CreativeStudio kind="code" /></SelfHealingBoundary>; }
