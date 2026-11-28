import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Open your ANVIK AI guest workspace — no sign-in required.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
