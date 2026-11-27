import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  description: "ANVIK design tokens and component states.",
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
