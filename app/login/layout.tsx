import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to ANVIK AI — chat, code, image and vision in one calm workspace.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
