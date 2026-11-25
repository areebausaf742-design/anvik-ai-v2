import type { Metadata } from "next";
import VisionStudio from "@/components/anvik/vision-studio";
import SelfHealingBoundary from "@/components/anvik/self-healing-boundary";
export const metadata: Metadata = { title: "Vision", description: "Bring an image into focus and explore what ANVIK AI sees." };
export default function VisionPage() { return <SelfHealingBoundary route="/vision"><VisionStudio/></SelfHealingBoundary>; }
