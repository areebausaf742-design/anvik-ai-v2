import type { Metadata } from "next";
import VisionStudio from "@/components/anvik/vision-studio";
export const metadata: Metadata = { title: "Vision", description: "Bring an image into focus and explore what ANVIK AI sees." };
export default function VisionPage() { return <VisionStudio/>; }
