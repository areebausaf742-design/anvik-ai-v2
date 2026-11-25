import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
import SelfHealingBoundary from "@/components/anvik/self-healing-boundary";
export const metadata: Metadata = { title: "Image studio", description: "Turn your ideas into images with ANVIK AI." };
export default function ImagePage() { return <SelfHealingBoundary route="/image"><CreativeStudio kind="image" /></SelfHealingBoundary>; }
