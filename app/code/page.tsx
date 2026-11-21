import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
export const metadata: Metadata = { title: "Code lab", description: "Sketch, reason through, and create code with ANVIK AI." };
export default function CodePage() { return <CreativeStudio kind="code" />; }
