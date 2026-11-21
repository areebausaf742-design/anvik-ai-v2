import type { Metadata } from "next";
import CreativeStudio from "@/components/anvik/creative-studio";
export const metadata: Metadata = { title: "Image studio", description: "Turn your ideas into images with ANVIK AI." };
export default function ImagePage() { return <CreativeStudio kind="image" />; }
