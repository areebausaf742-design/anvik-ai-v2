"use client";

import Link from "next/link";
import {
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquarePlus,
  Settings2,
} from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquarePlus },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/artifacts", label: "Artifacts", icon: LayoutGrid },
  { href: "/image", label: "Image", icon: ImageIcon },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="ANVIK AI Home"
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap focus-visible:outline-none"
    >
      <AnvikStar size="md" />
      <span className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
        ANVIK
        <span className="ml-1 text-xs font-medium tracking-widest text-[#999999]">AI</span>
      </span>
    </Link>
  );
}

export { NAV_ITEMS };
