import type { Metadata } from "next";
import PromptLibrary from "@/components/anvik/prompt-library";
export const metadata: Metadata = { title: "Prompt library", description: "Thoughtful prompt ideas to start your next conversation with ANVIK." };
export default function LibraryPage() { return <PromptLibrary/>; }
