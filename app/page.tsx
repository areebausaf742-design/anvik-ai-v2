import type { Metadata } from "next";
import ChatWorkspace from "@/components/anvik/chat-workspace";

export const metadata: Metadata = {
  title: "ANVIK AI",
  description: "A calm space to think, create, and get things done.",
};

export default function Home() {
  return <ChatWorkspace />;
}
