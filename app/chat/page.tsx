import type { Metadata } from "next";
import ChatWorkspace from "@/components/anvik/chat-workspace";
import SelfHealingBoundary from "@/components/anvik/self-healing-boundary";
export const metadata: Metadata = { title: "Chat", description: "Explore an idea with ANVIK AI." };
export default function ChatPage() { return <SelfHealingBoundary route="/chat"><ChatWorkspace /></SelfHealingBoundary>; }
