import type { Metadata } from "next";
import ChatWorkspace from "@/components/anvik/chat-workspace";
export const metadata: Metadata = { title: "Chat", description: "Explore an idea with ANVIK AI." };
export default function ChatPage() { return <ChatWorkspace />; }
