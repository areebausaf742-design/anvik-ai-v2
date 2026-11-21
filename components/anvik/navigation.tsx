"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  Code2,
  Eye,
  Image as ImageIcon,
  MessageSquareText,
  Settings2,
} from "lucide-react";

const tabs = [
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/image", label: "Image", icon: ImageIcon },
  { href: "/code", label: "Code", icon: Code2 },
  { href: "/voice", label: "Voice", icon: AudioLines },
  { href: "/vision", label: "Vision", icon: Eye },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="ANVIK AI Home"
      className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap focus-visible:outline-none"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-[#7C3AED] to-[#22D3EE] text-xs font-extrabold text-white shadow-md shadow-[#7C3AED]/30">
        A
      </span>
      <span className="text-lg font-extrabold tracking-tight">
        <span className="gradient-text">ANVIK</span>
        <span className="ml-1 text-xs font-semibold tracking-widest text-slate-400">AI</span>
      </span>
    </Link>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050508]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
        <div className="flex items-center justify-between gap-4">
          <Brand />
          {isLanding && (
            <Link
              href="/chat"
              className="btn-gradient inline-flex min-h-[36px] shrink-0 items-center rounded-xl px-4 py-1.5 text-xs font-semibold text-white sm:hidden"
            >
              Launch Chat
            </Link>
          )}
        </div>

        <nav
          aria-label="Workspace tabs"
          className="no-scrollbar flex w-full items-center gap-1.5 overflow-x-auto pb-0.5 sm:w-auto sm:pb-0"
        >
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                  active
                    ? "border border-[#7C3AED]/50 bg-gradient-to-r from-[#7C3AED]/25 to-[#22D3EE]/20 text-white shadow-sm shadow-[#7C3AED]/20"
                    : "border border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#22D3EE]" : "text-slate-400"}`} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {isLanding && (
          <div className="hidden shrink-0 sm:block">
            <Link
              href="/chat"
              className="btn-gradient inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-xl px-5 py-2 text-sm font-semibold text-white"
            >
              Launch Chat
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
